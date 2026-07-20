import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './auth/AdminRoute';
import { AppLayout } from './components/AppLayout';
import { catalogDefinitions } from './catalog-definitions';
import { CatalogPage } from './pages/CatalogPage';
import { InvoiceValidityPage } from './pages/InvoiceValidityPage';
import { LoginPage } from './pages/LoginPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AdminRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/sociedades" replace />} />
          <Route path="/sociedades" element={<CatalogPage definition={catalogDefinitions.sociedades} />} />
          <Route path="/centros" element={<CatalogPage definition={catalogDefinitions.centros} />} />
          <Route path="/cuentas" element={<CatalogPage definition={catalogDefinitions.cuentas} />} />
          <Route path="/ordenes-co" element={<CatalogPage definition={catalogDefinitions['ordenes-co']} />} />
          <Route path="/vigencia" element={<InvoiceValidityPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
