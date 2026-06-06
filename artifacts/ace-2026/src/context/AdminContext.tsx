import { createContext, useContext, ReactNode } from 'react';

interface AdminContextType {
  openAdmin: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const openAdmin = () => {
    window.location.href = '/admin';
  };
  return (
    <AdminContext.Provider value={{ openAdmin }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdmin must be used within AdminProvider');
  return context;
};