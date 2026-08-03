import { PrismaClient, PlatformPriority, SocialPlatform } from "@prisma/client";
import { createPasswordHash } from "../src/auth/password";

const prisma = new PrismaClient();

async function main() {
  const email = "alexandr@example.com";
  const passwordHash = await createPasswordHash("personaos-demo-2026");

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: "Александр",
      onboardingDone: true
    },
    create: {
      email,
      name: "Александр",
      onboardingDone: true,
      passwordCredential: {
        create: {
          passwordHash
        }
      }
    }
  });

  await prisma.passwordCredential.upsert({
    where: { userId: user.id },
    update: { passwordHash },
    create: { userId: user.id, passwordHash }
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "stengazeta" },
    update: {
      ownerId: user.id,
      name: "Стенгазета",
      description: "Личный бренд предпринимателя: бизнес, жизнь, психология, отношения, сарказм."
    },
    create: {
      ownerId: user.id,
      name: "Стенгазета",
      slug: "stengazeta",
      description: "Личный бренд предпринимателя: бизнес, жизнь, психология, отношения, сарказм.",
      members: {
        create: {
          userId: user.id,
          role: "OWNER"
        }
      }
    }
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id
      }
    },
    update: { role: "OWNER" },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "OWNER"
    }
  });

  await prisma.authorProfile.upsert({
    where: { workspaceId: workspace.id },
    update: {
      displayName: "Александр",
      bio: "Предприниматель, который собирает личный бренд из жизни, бизнеса и наблюдений.",
      positioning: "Личный бренд предпринимателя: бизнес, жизнь, психология, отношения, сарказм.",
      mainTopics: ["бизнес", "жизнь", "психология", "отношения", "сарказм", "личный опыт"],
      forbiddenTopics: ["фальшивые истории", "инфоцыганство"],
      toneOfVoice: ["честный", "саркастичный", "глубокий", "без пафоса"],
      sarcasmLevel: 4,
      depthLevel: 5,
      personalLevel: 4,
      expertiseLevel: 4,
      preferredPostLength: "MIXED",
      contentGoals: ["развивать личный бренд", "сохранять опыт", "писать честно"]
    },
    create: {
      workspaceId: workspace.id,
      displayName: "Александр",
      bio: "Предприниматель, который собирает личный бренд из жизни, бизнеса и наблюдений.",
      positioning: "Личный бренд предпринимателя: бизнес, жизнь, психология, отношения, сарказм.",
      mainTopics: ["бизнес", "жизнь", "психология", "отношения", "сарказм", "личный опыт"],
      forbiddenTopics: ["фальшивые истории", "инфоцыганство"],
      toneOfVoice: ["честный", "саркастичный", "глубокий", "без пафоса"],
      sarcasmLevel: 4,
      depthLevel: 5,
      personalLevel: 4,
      expertiseLevel: 4,
      preferredPostLength: "MIXED",
      contentGoals: ["развивать личный бренд", "сохранять опыт", "писать честно"]
    }
  });

  const defaults: Array<[SocialPlatform, PlatformPriority]> = [
    ["TELEGRAM", "PRIMARY"],
    ["INSTAGRAM", "PRIMARY"],
    ["THREADS", "SECONDARY"],
    ["VK", "LOW"]
  ];

  for (const [platform, priority] of defaults) {
    await prisma.socialAccount.upsert({
      where: {
        workspaceId_platform: {
          workspaceId: workspace.id,
          platform
        }
      },
      update: { priority, isActive: true },
      create: {
        workspaceId: workspace.id,
        platform,
        priority,
        isActive: true,
        publishingEnabled: false,
        analyticsEnabled: false
      }
    });
  }

  const existingCaptures = await prisma.capture.count({
    where: { workspaceId: workspace.id }
  });

  if (existingCaptures === 0) {
    await prisma.capture.createMany({
      data: [
        {
          workspaceId: workspace.id,
          sourceType: "TEXT",
          title: "После встречи",
          description: "Поймал мысль: доверие без ясных ожиданий быстро превращается в хаос.",
          tags: ["бизнес", "управление"],
          emotion: "THOUGHTFUL",
          importance: "HIGH",
          isFavorite: true,
          context: { source: "seed" }
        },
        {
          workspaceId: workspace.id,
          sourceType: "LINK",
          title: "Материал для размышления",
          description: "Вернуться к этой статье и связать с темой личного бренда без пафоса.",
          media: { url: "https://example.com" },
          tags: ["обучение"],
          emotion: "UNKNOWN",
          importance: "MEDIUM",
          context: { source: "seed" }
        }
      ]
    });
  }

  const personaProfile = await prisma.personaProfile.upsert({
    where: { workspaceId: workspace.id },
    update: {
      userId: user.id,
      summary:
        "Предпринимательский голос: бизнес, жизнь, психология поведения, отношения, сарказм и личный опыт без инфоцыганства.",
      values: ["честность", "личный опыт", "глубина", "практичность"],
      beliefs: ["контент должен расти из прожитой жизни", "глубокий смысл не требует пафоса"],
      themes: ["бизнес", "жизнь", "психология поведения", "отношения", "сарказм", "личный опыт"],
      tone: ["честный", "саркастичный", "глубокий", "без пафоса"],
      humorStyle: "сухой сарказм без превращения текста в стендап",
      sarcasmLevel: 4,
      emotionalityLevel: 3,
      riskAttitude: "готов к экспериментам, если они не разрушают авторскую честность",
      businessAttitude: "бизнес как практика решений, ответственности и наблюдения за людьми",
      peopleAttitude: "уважение к людям без романтизации и без лишней мягкости",
      moneyAttitude: "деньги как язык ответственности и выбора, не как единственная мера успеха",
      familyAttitude: "бережная зона, не материал для эксплуатации",
      forbiddenTopics: ["инфоцыганство", "фальшивые истории", "пустой пафос"],
      preferredFormats: ["короткое наблюдение", "личная история", "практичный вывод"]
    },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      summary:
        "Предпринимательский голос: бизнес, жизнь, психология поведения, отношения, сарказм и личный опыт без инфоцыганства.",
      values: ["честность", "личный опыт", "глубина", "практичность"],
      beliefs: ["контент должен расти из прожитой жизни", "глубокий смысл не требует пафоса"],
      themes: ["бизнес", "жизнь", "психология поведения", "отношения", "сарказм", "личный опыт"],
      tone: ["честный", "саркастичный", "глубокий", "без пафоса"],
      humorStyle: "сухой сарказм без превращения текста в стендап",
      sarcasmLevel: 4,
      emotionalityLevel: 3,
      riskAttitude: "готов к экспериментам, если они не разрушают авторскую честность",
      businessAttitude: "бизнес как практика решений, ответственности и наблюдения за людьми",
      peopleAttitude: "уважение к людям без романтизации и без лишней мягкости",
      moneyAttitude: "деньги как язык ответственности и выбора, не как единственная мера успеха",
      familyAttitude: "бережная зона, не материал для эксплуатации",
      forbiddenTopics: ["инфоцыганство", "фальшивые истории", "пустой пафос"],
      preferredFormats: ["короткое наблюдение", "личная история", "практичный вывод"]
    }
  });

  const existingSignals = await prisma.personaSignal.count({
    where: { workspaceId: workspace.id }
  });

  if (existingSignals === 0) {
    await prisma.personaSignal.createMany({
      data: [
        {
          workspaceId: workspace.id,
          sourceType: "AUTHOR_PROFILE",
          signalType: "THEME",
          value: "бизнес",
          confidence: 0.95,
          weight: 1.4
        },
        {
          workspaceId: workspace.id,
          sourceType: "AUTHOR_PROFILE",
          signalType: "THEME",
          value: "жизнь",
          confidence: 0.9,
          weight: 1.2
        },
        {
          workspaceId: workspace.id,
          sourceType: "AUTHOR_PROFILE",
          signalType: "THEME",
          value: "психология поведения",
          confidence: 0.9,
          weight: 1.2
        },
        {
          workspaceId: workspace.id,
          sourceType: "AUTHOR_PROFILE",
          signalType: "THEME",
          value: "отношения",
          confidence: 0.85,
          weight: 1.1
        },
        {
          workspaceId: workspace.id,
          sourceType: "AUTHOR_PROFILE",
          signalType: "HUMOR",
          value: "сарказм",
          confidence: 0.9,
          weight: 1.2
        },
        {
          workspaceId: workspace.id,
          sourceType: "AUTHOR_PROFILE",
          signalType: "STYLE",
          value: "личный опыт",
          confidence: 0.95,
          weight: 1.3
        },
        {
          workspaceId: workspace.id,
          sourceType: "AUTHOR_PROFILE",
          signalType: "FORBIDDEN_TOPIC",
          value: "инфоцыганство",
          confidence: 1,
          weight: 2
        },
        {
          workspaceId: workspace.id,
          sourceType: "AUTHOR_PROFILE",
          signalType: "TONE",
          value: "глубокий смысл без пафоса",
          confidence: 0.95,
          weight: 1.6
        }
      ]
    });
  }

  const existingPersonaVersions = await prisma.personaVersion.count({
    where: { workspaceId: workspace.id }
  });

  if (existingPersonaVersions === 0) {
    await prisma.personaVersion.create({
      data: {
        workspaceId: workspace.id,
        version: 1,
        reason: "Seed Persona DNA baseline",
        snapshot: personaProfile
      }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
