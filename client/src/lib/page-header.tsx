import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface PageHeaderInfo {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

interface PageHeaderContextType {
  headerInfo: PageHeaderInfo | null;
  setHeaderInfo: (info: PageHeaderInfo | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextType | undefined>(undefined);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [headerInfo, setHeaderInfo] = useState<PageHeaderInfo | null>(null);
  
  return (
    <PageHeaderContext.Provider value={{ headerInfo, setHeaderInfo }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader() {
  const context = useContext(PageHeaderContext);
  if (context === undefined) {
    throw new Error("usePageHeader must be used within a PageHeaderProvider");
  }
  return context;
}

export function useSetPageHeader(info: PageHeaderInfo) {
  const { setHeaderInfo } = usePageHeader();
  
  useEffect(() => {
    setHeaderInfo(info);
    return () => setHeaderInfo(null);
  }, [info.title, info.description]);
}
