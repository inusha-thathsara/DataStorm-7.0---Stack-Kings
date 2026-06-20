import Link from "next/link";
import { Alert } from "@/components/ui/Alert";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-lg py-12">
      <Alert title="Access denied" variant="warning">
        <p>
          Your account does not have permission to view this outlet or data outside your assigned
          scope.
        </p>
        <p className="mt-2 text-sm text-text-muted">
          Western-scoped users can only access Western Province outlets. Contact an administrator if
          you need broader access.
        </p>
      </Alert>
      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-md bg-brand-accent px-4 text-sm font-medium text-white hover:bg-brand-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
