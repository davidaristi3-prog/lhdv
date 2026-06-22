import { redirect } from 'next/navigation';

// Al entrar a Logística se abre la primera pestaña (Domicilios).
export default function LogisticaIndex() {
  redirect('/logistica/domicilios');
}
