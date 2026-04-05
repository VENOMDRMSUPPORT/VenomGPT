import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Switch, Route } from "wouter";
import Workspace from "./pages/workspace";
import HomePage from "./pages/home";
import SettingsPage from "./pages/settings";
import IntegrationsPage from "./pages/integrations";
import AppsPage from "./pages/apps";
import TemplatesPage from "./pages/templates";
import LoginPage from "./pages/login";
import ProtectedRoute from "./components/auth/protected-route";
import { ThemeProvider } from "@/lib/theme-context";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/login" component={LoginPage} />
            <Route path="/apps">
              {() => <ProtectedRoute component={AppsPage} />}
            </Route>
            <Route path="/templates" component={TemplatesPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/integrations" component={IntegrationsPage} />
            <Route component={Workspace} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
