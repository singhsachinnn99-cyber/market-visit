import crypto from 'crypto';

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

export const uploadToCloudinary = async (
  fileBase64: string, // "data:image/png;base64,..." or similar
  category: string
): Promise<CloudinaryUploadResult> => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  // Fallback to Mock upload if credentials are missing
  if (!cloudName || !apiKey || !apiSecret) {
    console.log(`[Cloudinary Mock] Simulating upload for photo in category: ${category}`);
    await new Promise((resolve) => setTimeout(resolve, 800)); // Simulate networking lag
    
    // Choose appropriate sample images for visual feedback
    let url = 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80'; // Dairy
    if (category === 'Beverages') {
      url = 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80';
    } else if (category === 'Ice Cream') {
      url = 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80';
    } else if (category === 'Assets') {
      url = 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80';
    }
    
    const mockId = `mock_${category.toLowerCase().replace(/\s+/g, '_')}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      secure_url: url,
      public_id: mockId,
    };
  }

  // Standard signed Cloudinary Upload
  const timestamp = Math.round(new Date().getTime() / 1000).toString();
  const folder = `field_visits/${category}`;

  // Sign parameters in alphabetical order
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha1')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  // Strip prefix if any, but Cloudinary accepts full base64 data URLs
  const base64Data = fileBase64.startsWith('data:')
    ? fileBase64
    : `data:image/jpeg;base64,${fileBase64}`;

  const bodyParams = new URLSearchParams();
  bodyParams.append('file', base64Data);
  bodyParams.append('api_key', apiKey);
  bodyParams.append('timestamp', timestamp);
  bodyParams.append('folder', folder);
  bodyParams.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cloudinary API error: ${response.status} - ${errorBody}`);
  }

  const result = await response.json();
  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
  };
};
export type UploadToCloudinary = typeof uploadToCloudinary;
export type CloudinaryUploadResultType = CloudinaryUploadResult;
