import { useState, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  className?: string;
}

export const Tabs = ({ tabs, defaultTab, onChange, className }: TabsProps) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  const handleChange = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  return (
    <div className={cn('w-full', className)}>
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleChange(tab.id)}
            className={cn(
              'relative px-4 py-2 text-sm font-mono transition-colors',
              activeTab === tab.id ? 'text-accent' : 'text-text-muted hover:text-text-color'
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
              />
            )}
          </button>
        ))}
      </div>
      <div className="pt-4">{tabs.find((t) => t.id === activeTab)?.content}</div>
    </div>
  );
};
