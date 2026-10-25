import { AdminPageSkeleton } from "@/components/admin/route-skeletons";

// Estado de carga de /admin/particulares/* (hoy solo `particulares/scraper`:
// el listado de /es/admin/particulares redirige a /captaciones, que usa la
// frontera general del admin). Antes era un esqueleto propio con `bg-white`,
// que no seguía el modo oscuro; ahora usa el genérico con tokens (CRM-02, E2).
export default function Loading() {
  return <AdminPageSkeleton />;
}
