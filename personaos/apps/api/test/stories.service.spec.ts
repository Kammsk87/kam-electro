import { describe, expect, it, vi } from "vitest";
import { StoriesService } from "../src/stories/stories.service";

const reflection = {
  id: "reflection-1",
  workspaceId: "workspace-1",
  capture: {
    title: "Встреча после производства",
    description: "Разговор с командой после сложного запуска.",
    transcript: null
  },
  messages: [
    { role: "ASSISTANT", content: "Что здесь произошло?" },
    { role: "USER", content: "Мы вышли после встречи и поняли, что команда устала." },
    { role: "ASSISTANT", content: "Почему ты решил сохранить именно этот момент?" },
    { role: "USER", content: "Потому что в этом была честная точка роста бизнеса." },
    { role: "ASSISTANT", content: "Что тебя удивило?" },
    { role: "USER", content: "Меня удивило, что все говорили аккуратно, но смотрели одинаково." },
    { role: "ASSISTANT", content: "Что было самым важным?" },
    { role: "USER", content: "Самым важным было не давить, а услышать усталость." },
    { role: "ASSISTANT", content: "Что изменилось после этого?" },
    { role: "USER", content: "После этого я стал смотреть на темп команды внимательнее." },
    { role: "ASSISTANT", content: "Какой главный вывод?" },
    { role: "USER", content: "Команда верит действиям, а не красивым словам." },
    { role: "ASSISTANT", content: "Что ты сказал бы себе год назад?" },
    { role: "USER", content: "Не прячь усталость команды за красивыми планами." },
    { role: "ASSISTANT", content: "Какая деталь важна?" },
    { role: "USER", content: "Люди не спорили, потому что уже всё показали лицами." },
    { role: "ASSISTANT", content: "Чему это может научить других?" },
    { role: "USER", content: "Не путать мотивацию с вниманием к реальности." }
  ]
};

describe("StoriesService", () => {
  it("creates a rule-based Story Draft from Reflection answers", async () => {
    const prisma = {
      interviewSession: {
        findUnique: vi.fn().mockResolvedValue(reflection)
      },
      workspaceMember: {
        findUnique: vi.fn().mockResolvedValue({ id: "membership-1" })
      },
      story: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "story-1", status: "DRAFT" })
      }
    };
    const workspacesService = { getActiveWorkspace: vi.fn() };
    const memoryService = { syncFromStory: vi.fn().mockResolvedValue({ id: "memory-1" }) };
    const service = new StoriesService(
      prisma as never,
      workspacesService as never,
      memoryService as never
    );

    await service.createFromReflection("user-1", reflection.id);

    expect(prisma.story.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: reflection.workspaceId,
        reflectionId: reflection.id,
        title: "Встреча после производства",
        hook: "После этого я стал смотреть на темп команды внимательнее.",
        context: expect.stringContaining("точка роста бизнеса"),
        conflict: expect.stringContaining("удивило"),
        insight: expect.stringContaining("Команда верит действиям"),
        takeaway: expect.stringContaining("Не путать мотивацию с вниманием к реальности."),
        status: "DRAFT"
      })
    });
    expect(memoryService.syncFromStory).toHaveBeenCalledWith("story-1");
  });
});
