import { useEffect, useState, type MouseEvent } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { Flame, MessageSquare } from 'lucide-react';
import { useReducedMotionPref } from '@/lib/hooks';

interface DemoCard {
  id: string;
  key: string;
  title: string;
  col: 0 | 1 | 2;
  tag: string;
  tagColor: string;
  initials: string;
  avatarColor: string;
  comments: number;
}

const INITIAL_CARDS: DemoCard[] = [
  {
    id: 'c1',
    key: 'WEB-12',
    title: 'Kinetic hero flow-field canvas',
    col: 0,
    tag: 'Design',
    tagColor: '#A78BFA',
    initials: 'PN',
    avatarColor: '#38BDF8',
    comments: 4,
  },
  {
    id: 'c2',
    key: 'API-08',
    title: 'Fractional midpoint task ordering',
    col: 1,
    tag: 'Feature',
    tagColor: '#C6F432',
    initials: 'AR',
    avatarColor: '#A78BFA',
    comments: 2,
  },
  {
    id: 'c3',
    key: 'API-04',
    title: 'Tenant isolation across all queries',
    col: 2,
    tag: 'Security',
    tagColor: '#10B981',
    initials: 'DU',
    avatarColor: '#C6F432',
    comments: 6,
  },
  {
    id: 'c4',
    key: 'MOB-19',
    title: 'Optimistic move with rollback',
    col: 1,
    tag: 'Feature',
    tagColor: '#C6F432',
    initials: 'PN',
    avatarColor: '#38BDF8',
    comments: 3,
  },
];

const COLS = ['To Do', 'In Progress', 'Done'] as const;

export function LiveKanbanPreview() {
  const reduced = useReducedMotionPref();
  const [cards, setCards] = useState<DemoCard[]>(INITIAL_CARDS);
  const [cursorStep, setCursorStep] = useState(0);

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const smoothX = useSpring(mouseX, { stiffness: 180, damping: 26 });
  const smoothY = useSpring(mouseY, { stiffness: 180, damping: 26 });
  const rotateY = useTransform(smoothX, [0, 1], [-5, 5]);
  const rotateX = useTransform(smoothY, [0, 1], [5, -5]);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setCursorStep((s) => (s + 1) % 3);
      setCards((prev) =>
        prev.map((c) => {
          if (c.id === 'c1') return { ...c, col: ((c.col + 1) % 3) as 0 | 1 | 2 };
          if (c.id === 'c4') return { ...c, col: c.col === 1 ? 2 : 1 };
          return c;
        }),
      );
    }, 2600);
    return () => clearInterval(id);
  }, [reduced]);

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };

  const handleLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  const priyaPos =
    cursorStep === 0
      ? { x: 110, y: 125 }
      : cursorStep === 1
        ? { x: 320, y: 120 }
        : { x: 520, y: 140 };
  const alexPos =
    cursorStep === 0
      ? { x: 480, y: 210 }
      : cursorStep === 1
        ? { x: 300, y: 225 }
        : { x: 505, y: 220 };

  return (
    <div
      className="relative mx-auto mt-14 max-w-4xl [perspective:1200px]"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <motion.div
        style={reduced ? undefined : { rotateX, rotateY }}
        className="relative overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-popover"
      >
        {/* Window top bar */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--elevated)] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#F43F5E]/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FACC15]/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]/80" />
            <span className="ml-3 font-mono text-xs text-[var(--text-muted)]">
              acme-labs / website-relaunch
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--muted-bg)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
              Live sync
            </span>
            <div className="flex -space-x-1.5">
              {[
                { i: 'PN', c: '#38BDF8' },
                { i: 'AR', c: '#A78BFA' },
                { i: 'DU', c: '#C6F432' },
              ].map((u) => (
                <span
                  key={u.i}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-[#0A0A0B] ring-2 ring-[var(--elevated)]"
                  style={{ backgroundColor: u.c }}
                >
                  {u.i}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Mini Kanban */}
        <div className="relative grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          {COLS.map((colName, colIdx) => {
            const colCards = cards.filter((c) => c.col === colIdx);
            return (
              <div
                key={colName}
                className="min-h-[210px] rounded-xl border border-[var(--border)] bg-[var(--bg)]/60 p-2.5"
              >
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-[var(--text)]">{colName}</span>
                  <span className="rounded-full bg-[var(--muted-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                    {colCards.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {colCards.map((card) => (
                    <motion.div
                      key={card.id}
                      layout
                      transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-card"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">
                          {card.key}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            color: card.tagColor,
                            backgroundColor: `${card.tagColor}1F`,
                          }}
                        >
                          {card.tag}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-[var(--text)]">{card.title}</p>
                      <div className="mt-2.5 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span className="inline-flex items-center gap-2">
                          <Flame className="h-3 w-3 text-[#FB923C]" />
                          <span className="inline-flex items-center gap-0.5">
                            <MessageSquare className="h-3 w-3" /> {card.comments}
                          </span>
                        </span>
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-[#0A0A0B]"
                          style={{ backgroundColor: card.avatarColor }}
                        >
                          {card.initials}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Simulated collaborator cursors */}
          {!reduced && (
            <>
              <motion.div
                aria-hidden="true"
                animate={priyaPos}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-none absolute left-0 top-0 hidden items-center gap-1 sm:flex"
              >
                <span className="h-2.5 w-2.5 rotate-12 rounded-sm bg-[#38BDF8] shadow" />
                <span className="rounded-full bg-[#38BDF8] px-1.5 py-0.5 text-[10px] font-semibold text-[#0A0A0B] shadow">
                  Priya
                </span>
              </motion.div>
              <motion.div
                aria-hidden="true"
                animate={alexPos}
                transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-none absolute left-0 top-0 hidden items-center gap-1 sm:flex"
              >
                <span className="h-2.5 w-2.5 rotate-12 rounded-sm bg-[#A78BFA] shadow" />
                <span className="rounded-full bg-[#A78BFA] px-1.5 py-0.5 text-[10px] font-semibold text-[#0A0A0B] shadow">
                  Alex
                </span>
              </motion.div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

