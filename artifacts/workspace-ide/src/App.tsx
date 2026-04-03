import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Switch, Route } from "wouter";
import Workspace from "./pages/workspace";
import HomePage from "./pages/home";
import SettingsPage from "./pages/settings";
import IntegrationsPage from "./pages/integrations";

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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/integrations" component={IntegrationsPage} />
          <Route component={Workspace} />
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
