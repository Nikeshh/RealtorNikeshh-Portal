import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-middleware';
import prisma from '@/lib/prisma';

interface TopProperty {
  id: string;
  title: string;
  commission: number;
  status: string;
}

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Get total revenue and commissions
    const [totalRevenue, totalCommissions] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          type: 'INCOME'
        },
        _sum: {
          amount: true
        }
      }),
      prisma.commission.aggregate({
        _sum: {
          amount: true
        }
      })
    ]);

    // Get monthly revenue
    const [currentMonthRevenue, lastMonthRevenue] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          type: 'INCOME',
          date: {
            gte: startOfMonth
          }
        },
        _sum: {
          amount: true
        }
      }),
      prisma.transaction.aggregate({
        where: {
          type: 'INCOME',
          date: {
            gte: startOfLastMonth,
            lt: startOfMonth
          }
        },
        _sum: {
          amount: true
        }
      })
    ]);

    // Calculate monthly growth
    const currentMonthAmount = currentMonthRevenue._sum.amount || 0;
    const lastMonthAmount = lastMonthRevenue._sum.amount || 0;
    const monthlyGrowth = lastMonthAmount === 0 
      ? 100 
      : ((currentMonthAmount - lastMonthAmount) / lastMonthAmount) * 100;

    // Get pending commissions and active deals
    const [pendingCommissions, activeDeals] = await Promise.all([
      prisma.commission.aggregate({
        where: {
          status: 'PENDING'
        },
        _sum: {
          amount: true
        }
      }),
      prisma.commission.count({
        where: {
          status: 'PENDING'
        }
      })
    ]);

    // Get recent transactions
    const recentTransactions = await prisma.transaction.findMany({
      take: 5,
      orderBy: {
        date: 'desc'
      },
      select: {
        id: true,
        date: true,
        type: true,
        amount: true,
        description: true,
        category: true
      }
    });

    // Get top properties by commission
    const topProperties = await prisma.commission.findMany({
      take: 5,
      orderBy: {
        amount: 'desc'
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            status: true
          }
        }
      }
    });

    return NextResponse.json({
      totalRevenue: totalRevenue._sum.amount || 0,
      totalCommissions: totalCommissions._sum.amount || 0,
      pendingCommissions: pendingCommissions._sum.amount || 0,
      monthlyRevenue: currentMonthAmount,
      monthlyGrowth: parseFloat(monthlyGrowth.toFixed(2)),
      activeDeals,
      recentTransactions,
      topProperties: topProperties.map(commission => ({
        id: commission.property.id,
        title: commission.property.title,
        commission: commission.amount,
        status: commission.property.status
      }))
    });
  } catch (error) {
    console.error('Error fetching financial stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch financial statistics' },
      { status: 500 }
    );
  }
}); 