export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 p-12 text-center">
      <h1 className="text-4xl font-black">Квиз 1723</h1>
      <p className="max-w-md text-zinc-600">
        MVP-платформа для проведения офлайн квиз-игр: панель ведущего и
        анимированный экран для проектора в баре.
      </p>
      <div className="flex gap-4">
        <a
          href="/admin"
          className="rounded bg-black px-4 py-2 text-white hover:bg-zinc-800"
        >
          Админка
        </a>
        <a
          href="/control"
          className="rounded bg-black px-4 py-2 text-white hover:bg-zinc-800"
        >
          Панель ведущего
        </a>
        <a
          href="/presenter"
          className="rounded border border-black px-4 py-2 hover:bg-zinc-100"
        >
          Экран для зала
        </a>
      </div>
    </div>
  );
}
