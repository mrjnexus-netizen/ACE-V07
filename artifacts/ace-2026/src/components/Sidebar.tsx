import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

export interface SidebarItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  sectionId?: string;
}

interface SidebarProps {
  items: SidebarItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  collapsible?: boolean;
  className?: string;
}

export const Sidebar = ({ items, activeId, onSelect, collapsible = true, className }: SidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState(activeId || items[0]?.id);

  // Observe sections if sectionId provided
  useEffect(() => {
    if (!items.some(item => item.sectionId)) return;
    const observers: IntersectionObserver[] = [];
    const sectionElements = items
      .map(item => item.sectionId ? document.getElementById(item.sectionId) : null)
      .filter(Boolean) as HTMLElement[];

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length) {
          const id = visible[0].target.id;
          const matched = items.find(i => i.sectionId === id);
          if (matched) setActiveSection(matched.id);
        }
      },
      { threshold: 0.3, rootMargin: '0px 0px -40% 0px' }
    );
    sectionElements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const handleSelect = (id: string) => {
    setActiveSection(id);
    onSelect(id);
    const item = items.find(i => i.id === id);
    if (item?.sectionId) {
      const el = document.getElementById(item.sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-surface2 border-r border-border transition-all duration-300 z-40',
        collapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-border">
          {!collapsed && <span className="font-display text-accent">ACE</span>}
          {collapsible && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-text-muted hover:text-text-color transition"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? '→' : '←'}
            </button>
          )}
        </div>
        <nav className="flex-1 py-4">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={cn(
                'flex items-center w-full px-4 py-3 text-left transition-colors',
                activeSection === item.id
                  ? 'text-accent bg-accent/10 border-l-2 border-accent'
                  : 'text-text-muted hover:text-text-color hover:bg-surface3'
              )}
            >
              {item.icon && <span className="mr-3 text-xl">{item.icon}</span>}
              {!collapsed && <span className="text-sm font-mono">{item.label}</span>}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
};
