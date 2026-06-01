import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../utils/formatters';

const COLORS = {
  Paid:    '#16A34A',
  Pending: '#F59E0B',
  Overdue: '#DC2626',
  Partial: '#4F46E5',
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-card-md text-xs">
      <span className="font-semibold text-slate-800">{payload[0].name}</span>
      <span className="text-slate-500 ml-2">{payload[0].value} units</span>
    </div>
  );
};

const RentCollectionChart = ({ breakdown, stats }) => {
  const data = [
    { name: 'Paid',    value: breakdown?.paid    || 0 },
    { name: 'Pending', value: breakdown?.pending  || 0 },
    { name: 'Overdue', value: breakdown?.overdue  || 0 },
    { name: 'Partial', value: breakdown?.partial  || 0 },
  ].filter((d) => d.value > 0);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="card h-full">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="section-title">Rent Collection</h3>
          <p className="text-xs text-slate-400 mt-0.5">Current month</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Collected</p>
          <p className="text-lg font-bold text-slate-900">{formatCurrency(stats?.totalCollected || 0)}</p>
        </div>
      </div>

      {total === 0 ? (
        <div className="h-[200px] flex items-center justify-center">
          <p className="text-sm text-slate-400">No data yet</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={COLORS[entry.name]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      )}

      <div className="mt-4 space-y-2.5">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2.5">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: COLORS[d.name] }}
            />
            <span className="text-xs text-slate-500 flex-1">{d.name}</span>
            <span className="text-xs font-semibold text-slate-700">{d.value} units</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RentCollectionChart;
