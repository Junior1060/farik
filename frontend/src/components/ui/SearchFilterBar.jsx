import React from 'react';
import { Search } from 'lucide-react';

const SearchFilterBar = ({ value, onChange, placeholder = 'Search...', children }) => (
  <div className="flex items-center gap-3 flex-wrap">
    <div className="relative flex-1 min-w-[200px] max-w-xs">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-9"
      />
    </div>
    {children}
  </div>
);

export default SearchFilterBar;
