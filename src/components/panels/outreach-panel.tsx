'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useSmartPoll } from '@/lib/use-smart-poll'

interface OutreachEmail {
  id: string
  recipient: string
  subject: string
  body: string
  status: 'sent' | 'opened'
  sent_at: number
  opened_at: number | null
  ip_address: string | null
  user_agent: string | null
  followup_at: number | null
  followup_status: 'none' | 'pending' | 'sent' | 'cancelled'
}

export function OutreachPanel() {
  const [emails, setEmails] = useState<OutreachEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null)
  const [schedulingId, setSchedulingId] = useState<string | null>(null)
  const [followupValue, setFollowupValue] = useState('2')
  const [followupUnit, setFollowupUnit] = useState('days')

  const fetchOutreach = useCallback(async () => {
    try {
      const res = await fetch('/api/outreach?limit=50')
      if (!res.ok) throw new Error('Failed to fetch outreach data')
      const data = await res.json()
      setEmails(data.emails || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchOutreach() }, [fetchOutreach])
  useSmartPoll(fetchOutreach, 30000)

  async function handleScheduleFollowup(emailId: string) {
    try {
      const val = parseInt(followupValue)
      let seconds = 0
      if (followupUnit === 'days') seconds = val * 24 * 3600
      else if (followupUnit === 'weeks') seconds = val * 7 * 24 * 3600
      else if (followupUnit === 'months') seconds = val * 30 * 24 * 3600

      const followupAt = Math.floor(Date.now() / 1000) + seconds

      const res = await fetch('/api/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: emailId,
          followup_at: followupAt,
          followup_status: 'pending'
        })
      })

      if (res.ok) {
        setSchedulingId(null)
        fetchOutreach()
      }
    } catch (err) {
      console.error('Failed to schedule followup', err)
    }
  }

  function formatTime(ts: number) {
    return new Date(ts * 1000).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="p-5 space-y-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-foreground">Outreach Tracking</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitor email opens and schedule automated follow-ups
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-3 pr-2">
        {loading && emails.length === 0 ? (
          <div className="text-center py-10 text-xs text-muted-foreground">Loading outreach data...</div>
        ) : emails.length === 0 ? (
          <div className="text-center py-10 text-xs text-muted-foreground">No emails sent yet.</div>
        ) : (
          emails.map((email) => (
            <div key={email.id} className={`rounded-lg border p-4 space-y-3 transition-smooth ${selectedEmail === email.id ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
              <div className="flex items-start justify-between gap-4 cursor-pointer" onClick={() => setSelectedEmail(selectedEmail === email.id ? null : email.id)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${email.status === 'opened' ? 'bg-green-500' : 'bg-blue-400'}`} />
                    <span className="text-sm font-medium text-foreground truncate">{email.recipient}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${email.status === 'opened' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {email.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">{email.subject}</p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/60">
                    <span>Sent: {formatTime(email.sent_at)}</span>
                    {email.opened_at && <span>Opened: {formatTime(email.opened_at)}</span>}
                    {email.followup_at && (
                      <span className="text-amber-400">
                        Follow-up: {formatTime(email.followup_at)} ({email.followup_status})
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={(e) => {
                  e.stopPropagation();
                  setSchedulingId(schedulingId === email.id ? null : email.id);
                }}>
                  {email.followup_at ? 'Edit Follow-up' : 'Schedule Follow-up'}
                </Button>
              </div>

              {schedulingId === email.id && (
                <div className="p-3 bg-surface-2 rounded-md border border-border flex items-center gap-3">
                  <span className="text-xs text-foreground">Follow up in:</span>
                  <input 
                    type="number" 
                    className="w-16 bg-background border border-border rounded px-2 py-1 text-xs"
                    value={followupValue}
                    onChange={(e) => setFollowupValue(e.target.value)}
                  />
                  <select 
                    className="bg-background border border-border rounded px-2 py-1 text-xs"
                    value={followupUnit}
                    onChange={(e) => setFollowupUnit(e.target.value)}
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                  <Button size="xs" onClick={() => handleScheduleFollowup(email.id)}>Save</Button>
                  <Button variant="ghost" size="xs" onClick={() => setSchedulingId(null)}>Cancel</Button>
                </div>
              )}

              {selectedEmail === email.id && (
                <div className="space-y-2 mt-3 pt-3 border-t border-border/50">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Email Content (Draft)</p>
                  <div className="text-xs text-foreground whitespace-pre-wrap bg-surface-1 p-3 rounded border border-border/30 max-h-60 overflow-auto font-mono">
                    {email.body}
                  </div>
                  {(email.ip_address || email.user_agent) && (
                    <div className="text-[10px] text-muted-foreground/50 font-mono">
                      {email.ip_address && <span>IP: {email.ip_address} · </span>}
                      {email.user_agent && <span className="truncate">UA: {email.user_agent}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
