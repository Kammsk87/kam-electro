import { useEffect, useMemo, useState } from "react";
import BottomNav from "./components/BottomNav.jsx";
import History from "./components/History.jsx";
import Home from "./components/Home.jsx";
import Onboarding from "./components/Onboarding.jsx";
import Profile from "./components/Profile.jsx";
import WorkoutActive from "./components/WorkoutActive.jsx";
import WorkoutSummary from "./components/WorkoutSummary.jsx";
import { calculateReadiness } from "./utils/readiness.js";
import { generateWorkout } from "./utils/workoutGenerator.js";
import { loadCheckins, loadProfile, loadWorkouts, saveCheckins, saveProfile, saveWorkouts } from "./utils/storage.js";

const todayKey = () => new Date().toISOString().slice(0, 10);
const defaultCheckin = { date: todayKey(), sleep: 7, energy: 7, stress: 4, pain: 1, readinessScore: 7.25 };

export default function App() {
  const [profile, setProfileState] = useState(() => loadProfile());
  const [workouts, setWorkouts] = useState(() => loadWorkouts());
  const [checkins, setCheckins] = useState(() => loadCheckins());
  const [appState, setAppState] = useState(() => (loadProfile() ? "home" : "onboarding"));
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [summarySession, setSummarySession] = useState(null);

  const todayCheckin = useMemo(() => {
    const existing = checkins.find((checkin) => checkin.date === todayKey());
    return existing || defaultCheckin;
  }, [checkins]);

  const workout = useMemo(() => {
    if (!profile) return null;
    return generateWorkout(profile, workouts, todayCheckin);
  }, [profile, workouts, todayCheckin]);

  useEffect(() => {
    if (profile) saveProfile(profile);
  }, [profile]);

  useEffect(() => saveWorkouts(workouts), [workouts]);
  useEffect(() => saveCheckins(checkins), [checkins]);

  const setProfile = (nextProfile) => setProfileState(nextProfile);

  const completeOnboarding = (newProfile) => {
    setProfileState(newProfile);
    setAppState("home");
  };

  const setCheckinValue = (key, value) => {
    const next = { ...todayCheckin, [key]: value };
    next.readinessScore = calculateReadiness(next);
    const rest = checkins.filter((checkin) => checkin.date !== todayKey());
    setCheckins([next, ...rest]);
  };

  const startWorkout = () => {
    setActiveWorkout(workout);
    setAppState("workout_active");
  };

  const finishWorkout = (session) => {
    setSummarySession(session);
    setAppState("workout_summary");
  };

  const saveSummary = ({ feedback, notes }) => {
    const saved = {
      id: crypto.randomUUID?.() || String(Date.now()),
      date: new Date().toISOString(),
      type: summarySession.workout.type,
      muscleGroup: summarySession.workout.muscleGroup,
      name: summarySession.workout.name,
      durationMinutes: summarySession.durationMinutes,
      feedback,
      notes,
      exercises: summarySession.exercises,
    };
    setWorkouts([saved, ...workouts]);
    setSummarySession(null);
    setActiveWorkout(null);
    setAppState("home");
  };

  const reloadAll = () => {
    setProfileState(loadProfile());
    setWorkouts(loadWorkouts());
    setCheckins(loadCheckins());
    setAppState(loadProfile() ? "profile" : "onboarding");
  };

  if (appState === "onboarding") return <Onboarding onComplete={completeOnboarding} />;
  if (!profile || !workout) return <Onboarding onComplete={completeOnboarding} />;

  if (appState === "workout_active") {
    return <WorkoutActive workout={activeWorkout || workout} profile={profile} previousWorkouts={workouts} onCancel={() => setAppState("home")} onFinish={finishWorkout} />;
  }

  if (appState === "workout_summary" && summarySession) {
    return <WorkoutSummary session={summarySession} onSave={saveSummary} />;
  }

  return (
    <div className="min-h-screen bg-[#0f0f14]">
      <div className="animate-[fadeIn_150ms_ease-out]">
        {appState === "home" && (
          <Home
            profile={profile}
            checkin={todayCheckin}
            setCheckinValue={setCheckinValue}
            workout={workout}
            streak={calcStreak(workouts)}
            onStartWorkout={startWorkout}
            onProfile={() => setAppState("profile")}
            onChangeWorkout={() => {
              const next = { ...todayCheckin, readinessScore: Math.max(4, todayCheckin.readinessScore - 1) };
              setCheckins([next, ...checkins.filter((checkin) => checkin.date !== todayKey())]);
            }}
          />
        )}
        {appState === "history" && <History workouts={workouts} onStart={() => setAppState("home")} />}
        {appState === "profile" && <Profile profile={profile} setProfile={setProfile} onImported={reloadAll} onCleared={reloadAll} />}
      </div>
      <BottomNav appState={appState} setAppState={setAppState} />
    </div>
  );
}

function calcStreak(workouts) {
  const days = new Set(workouts.map((workout) => workout.date.slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  for (let index = 0; index < 30; index += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
