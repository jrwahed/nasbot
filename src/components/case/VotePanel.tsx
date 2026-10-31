'use client'

import { useT } from '@/components/CopyProvider'
import type { CasePlayer, CaseVoteState } from '@/lib/cases'

/**
 * التصويت.
 *
 * 🔴 **النتيجة ما بتبانش غير لما الكل يصوّت** — والشاشة دي مش بتعرف
 *    «مين صوّت لمين» أصلًا. `fn_case_vote_state` بترجّع أرقام بس
 *    (كام صوّت) + صوتي أنا. فمفيش حاجة تتخبّي.
 */
export function VotePanel({
  players,
  state,
  onVote,
  busy,
}: {
  players: CasePlayer[]
  state: CaseVoteState
  onVote: (profileId: string) => void
  busy: boolean
}) {
  const t = useT()
  const others = players.filter((p) => !p.isMe)

  return (
    <section className="mt-5">
      <h2 className="text-[19px] font-bold">{t('case.vote.title')}</h2>
      <p className="mt-1 text-[14px] opacity-80">
        {state.round === 2 ? t('case.vote.early') : t('case.vote.final')}
      </p>

      <ul className="mt-3 space-y-2">
        {others.map((p) => {
          const mine = state.myTarget === p.profileId
          return (
            <li key={p.profileId}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onVote(p.profileId)}
                className="flex w-full items-center justify-between rounded-16 px-4 py-3 text-right"
                style={{
                  background: mine ? '#2B4CFF' : '#EFE3CF',
                  color: mine ? '#FBF7EF' : '#14161A',
                }}
              >
                <span className="text-[16px] font-bold">
                  {p.codename ? `${p.codename} · ${p.name}` : p.name}
                </span>
                <span className="text-[13px] opacity-80">
                  {mine ? t('case.vote.mine') : t('case.vote.cta')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-[13px] opacity-70">
        {state.everyoneVoted
          ? t('case.vote.all')
          : t('case.vote.waiting')
              .replace('{{1}}', String(state.voted))
              .replace('{{2}}', String(state.players))}
      </p>
      {!state.everyoneVoted ? (
        <p className="text-[13px] opacity-60">{t('case.vote.change')}</p>
      ) : null}
    </section>
  )
}
