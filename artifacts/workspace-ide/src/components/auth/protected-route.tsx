/**
 * ProtectedRoute
 *
 * TEMPORARY BOOTSTRAP — Wraps a route component and redirects unauthenticated
 * users to /login. Replace with a real auth guard when proper authentication
 * is implemented.
 */

import { Redirect } from "wouter";
import { isLoggedIn } from "@/auth/bootstrap-auth";

interface ProtectedRouteProps {
  component: React.ComponentType;
}

export default function ProtectedRoute({ component: Component }: ProtectedRouteProps) {
  if (!isLoggedIn()) {
    return <Redirect to="/login" />;
  }
  return <Component />;
}
