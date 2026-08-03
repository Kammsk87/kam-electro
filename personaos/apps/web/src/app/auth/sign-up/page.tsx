import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Создай PersonaOS</CardTitle>
          <CardDescription>
            Это не CRM-аккаунт. Это начало цифровой версии твоего личного бренда.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <AuthForm mode="sign-up" />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
