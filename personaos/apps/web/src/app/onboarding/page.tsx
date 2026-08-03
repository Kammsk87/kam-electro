import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export default function OnboardingPage() {
  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto mb-8 max-w-3xl">
        <p className="text-sm font-medium text-muted-foreground">Настройка PersonaOS</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Соберем твой авторский контур
        </h1>
        <p className="mt-3 text-muted-foreground">
          Пять коротких шагов, чтобы PersonaOS понимал не только аккаунты, но и человека за ними.
        </p>
      </div>
      <OnboardingFlow />
    </main>
  );
}
