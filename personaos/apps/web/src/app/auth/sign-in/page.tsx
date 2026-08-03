import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Войти в PersonaOS</CardTitle>
          <CardDescription>
            Вернись к системе, которая помогает помнить жизнь и говорить своим голосом.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <AuthForm mode="sign-in" />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
