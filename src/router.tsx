import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface RouterContextType {
  path: string;
  params: Record<string, string>;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextType>({
  path: '/',
  params: {},
  navigate: () => {},
});

export function useNavigate() {
  const { navigate } = useContext(RouterContext);
  return navigate;
}

export function useParams() {
  const { params } = useContext(RouterContext);
  return params;
}

export function useLocation() {
  const { path } = useContext(RouterContext);
  return { pathname: path };
}

interface LinkProps {
  to: string;
  className?: string | ((args: { isActive: boolean }) => string);
  children: ReactNode;
  onClick?: () => void;
}

export function Link({ to, className, children, onClick }: LinkProps) {
  const { navigate, path } = useContext(RouterContext);
  const resolvedClass = typeof className === 'function'
    ? className({ isActive: path === to || (to !== '/' && path.startsWith(to)) })
    : className;
  return (
    <a
      href={to}
      className={resolvedClass}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function NavLink({ to, className, children, onClick }: LinkProps) {
  return <Link to={to} className={className} onClick={onClick}>{children}</Link>;
}

interface RouteConfig {
  path: string;
  element: ReactNode;
  children?: RouteConfig[];
}

function matchRoute(routePath: string, currentPath: string): Record<string, string> | null {
  const routeParts = routePath.split('/').filter(Boolean);
  const pathParts = currentPath.split('/').filter(Boolean);
  if (routeParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(':')) {
      params[routeParts[i].slice(1)] = pathParts[i];
    } else if (routeParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// Simple outlet context
const OutletContext = createContext<ReactNode>(null);
export function Outlet() {
  return <>{useContext(OutletContext)}</>;
}

interface RoutesProps {
  children: ReactNode;
}

function flattenRoutes(children: ReactNode, parentPath = ''): Array<{ fullPath: string; element: ReactNode; layout?: ReactNode }> {
  const result: Array<{ fullPath: string; element: ReactNode; layout?: ReactNode }> = [];
  const arr = Array.isArray(children) ? children : [children];
  for (const child of arr) {
    if (!child || typeof child !== 'object' || !('props' in (child as object))) continue;
    const c = child as { props: { path?: string; element?: ReactNode; children?: ReactNode; index?: boolean } };
    const seg = c.props.path ?? '';
    const full = seg.startsWith('/') ? seg : (parentPath ? `${parentPath}/${seg}` : `/${seg}`).replace('//', '/');
    if (c.props.children) {
      // Layout route — distribute children
      const sub = Array.isArray(c.props.children) ? c.props.children : [c.props.children];
      for (const s of sub) {
        if (!s || typeof s !== 'object' || !('props' in (s as object))) continue;
        const sc = s as { props: { path?: string; element?: ReactNode; index?: boolean } };
        if (sc.props.index) {
          result.push({ fullPath: full, element: sc.props.element, layout: c.props.element });
        } else if (sc.props.path) {
          const childFull = sc.props.path.startsWith('/') ? sc.props.path : `${full}/${sc.props.path}`;
          result.push({ fullPath: childFull, element: sc.props.element, layout: c.props.element });
        }
      }
    } else {
      result.push({ fullPath: full, element: c.props.element });
    }
  }
  return result;
}

export function Routes({ children }: RoutesProps) {
  const { path, navigate } = useContext(RouterContext);
  const routes = flattenRoutes(children);

  for (const route of routes) {
    const params = matchRoute(route.fullPath, path);
    if (params !== null) {
      const element = route.layout
        ? (
          <RouterContext.Provider value={{ path, params, navigate }}>
            <OutletContext.Provider value={route.element}>
              {route.layout}
            </OutletContext.Provider>
          </RouterContext.Provider>
        )
        : (
          <RouterContext.Provider value={{ path, params, navigate }}>
            {route.element}
          </RouterContext.Provider>
        );
      return <>{element}</>;
    }
  }
  return null;
}

export function Route(_props: { path?: string; element?: ReactNode; children?: ReactNode; index?: boolean }) {
  return null;
}

export function Navigate({ to, replace: _replace }: { to: string; replace?: boolean }) {
  const { navigate } = useContext(RouterContext);
  useEffect(() => { navigate(to); }, []);
  return null;
}

export function BrowserRouter({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, '', to);
    setPath(to);
  }, []);

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  return (
    <RouterContext.Provider value={{ path, params: {}, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}
