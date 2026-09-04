"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/money";

type Point = { date: string; revenue: number; orders: number };

/**
 * Daily paid revenue. Values arrive in minor units and format on display.
 *
 * Recharts draws its axis and tooltip text as SVG, so the 14px floor the rest
 * of the app gets from the type scale has to be passed in by hand here. The
 * axis width and tick gap are sized for labels at that step.
 */
export function RevenueChart({ data }: { data: Point[] }) {
  const hasRevenue = data.some((d) => d.revenue > 0);

  if (!hasRevenue) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-[var(--text-muted)]">
        No paid orders in this window yet.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b6a4b" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#8b6a4b" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="2 4" stroke="#e7e7e4" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={(value: string) =>
              new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
            }
            tick={{ fontSize: 14, fill: "#8a8a7e" }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />

          <YAxis
            tickFormatter={(value: number) => `${Math.round(value / 100)}`}
            tick={{ fontSize: 14, fill: "#8a8a7e" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />

          <Tooltip
            contentStyle={{
              borderRadius: 4,
              border: "1px solid #e7e7e4",
              fontSize: 14,
            }}
            labelFormatter={(label) =>
              new Date(String(label)).toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "long",
              })
            }
            formatter={(value) => [formatMoney(Number(value)), "Revenue"]}
          />

          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#8b6a4b"
            strokeWidth={1.75}
            fill="url(#revenueFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
