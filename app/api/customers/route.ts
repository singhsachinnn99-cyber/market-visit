import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { customerRepository } from '@/repositories/customer-repository';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const routeCode = searchParams.get('routeCode');

    let customers;
    if (routeCode) {
      customers = await customerRepository.getCustomersByRoute(routeCode);
    } else {
      customers = await customerRepository.getAllCustomers();
    }

    return NextResponse.json(customers);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
