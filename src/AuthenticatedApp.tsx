import App from "@/App";
import { Toaster } from "@/components/ui/sonner";

export default function AuthenticatedApp() {
  return (
    <>
      <App />
      <Toaster
        position="bottom-center"
        closeButton
        mobileOffset={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
      />
    </>
  );
}
