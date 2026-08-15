import { useState } from 'react'
import { UserPlus, Trash2, Crown, Users, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { CardSkeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/stores/appStore'
import { useWalletStore } from '@/stores/walletStore'
import { useHousehold } from '@/hooks/useHousehold'
import { shortenAddress } from '@/lib/money'
import { formatDate } from '@/lib/utils'
import type { Member } from '@/types'

function MemberCard({
  member,
  isOwner,
  canRemove,
  onRemove,
}: {
  member: Member
  isOwner: boolean
  canRemove: boolean
  onRemove: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copyAddress() {
    navigator.clipboard.writeText(member.address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const initials = member.displayName.slice(0, 2).toUpperCase()

  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold select-none"
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800 truncate">{member.displayName}</p>
          {isOwner && (
            <Crown className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" aria-label="Owner" />
          )}
        </div>
        <button
          onClick={copyAddress}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 rounded"
          aria-label={copied ? 'Copied!' : `Copy address ${member.address}`}
        >
          <span className="font-mono">{shortenAddress(member.address)}</span>
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
        <p className="text-xs text-slate-400">Joined {formatDate(member.joinedAt)}</p>
      </div>
      {canRemove && (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onRemove}
          aria-label={`Remove ${member.displayName}`}
          className="text-slate-400 hover:text-red-500 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

// ─── Create household form ────────────────────────────────────────────────────

function CreateHouseholdForm() {
  const { createHousehold } = useHousehold()
  const { status: walletStatus } = useWalletStore()
  const isConnected = walletStatus === 'connected'
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('Name is required'); return }
    setError('')
    setLoading(true)
    try {
      await createHousehold(trimmed)
    } catch {
      // errors handled by hook
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a household</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Household name"
            placeholder="e.g. Apartment 204"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            error={error}
            maxLength={64}
            autoFocus
          />
          {!isConnected && (
            <p className="text-sm text-amber-600 bg-amber-50 rounded-xl px-4 py-3">
              Connect your Freighter wallet to create a household.
            </p>
          )}
          <Button type="submit" loading={loading} disabled={!isConnected} className="w-full">
            Create Household
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function HouseholdPage() {
  const { household, isLoading } = useAppStore()
  const { publicKey } = useWalletStore()
  const { addMember, removeMember } = useHousehold()

  const [addOpen, setAddOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)
  const [newAddress, setNewAddress] = useState('')
  const [newName, setNewName] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addrError, setAddrError] = useState('')
  const [nameError, setNameError] = useState('')

  if (isLoading && !household) return <CardSkeleton rows={4} />

  if (!household) return (
    <div className="space-y-5 animate-fade-in">
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-slate-800">Household</h1>
        <p className="text-sm text-slate-500 mt-1">Set up your shared home.</p>
      </div>
      <CreateHouseholdForm />
    </div>
  )

  const isOwner = household.owner === publicKey
  const activeMembers = household.members.filter(m => m.active)

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    let valid = true
    if (!newAddress.trim()) { setAddrError('Stellar address is required'); valid = false }
    else if (!newAddress.startsWith('G') || newAddress.length !== 56) {
      setAddrError('Enter a valid Stellar address (starts with G, 56 chars)'); valid = false
    }
    if (!newName.trim()) { setNameError('Display name is required'); valid = false }
    if (!valid) return

    setAddLoading(true)
    try {
      await addMember(newAddress.trim(), newName.trim())
      setAddOpen(false)
      setNewAddress('')
      setNewName('')
    } catch {
      // errors handled by hook
    } finally {
      setAddLoading(false)
    }
  }

  async function handleRemoveMember() {
    if (!removeTarget) return
    try {
      await removeMember(removeTarget.address)
    } finally {
      setRemoveTarget(null)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-slate-800">{household.name}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {activeMembers.length} {activeMembers.length === 1 ? 'member' : 'members'}
        </p>
      </div>

      {/* Status */}
      {household.periodClosed && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center gap-2">
          <span className="text-emerald-600">🎉</span>
          <p className="text-sm text-emerald-700 font-medium">
            {household.periodLabel} is closed and fully settled.
          </p>
        </div>
      )}

      {/* Members list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-400" />
              Members
            </CardTitle>
            {isOwner && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAddOpen(true)}
                className="gap-1.5 text-indigo-600 hover:bg-indigo-50"
                aria-label="Add member"
              >
                <UserPlus className="h-4 w-4" />
                Add
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {activeMembers.length === 0 ? (
            <EmptyState icon={Users} title="No members yet" className="border-0 bg-transparent py-6" />
          ) : (
            <div className="divide-y divide-slate-50">
              {activeMembers.map(member => (
                <MemberCard
                  key={member.address}
                  member={member}
                  isOwner={member.address === household.owner}
                  canRemove={isOwner && member.address !== household.owner}
                  onRemove={() => setRemoveTarget(member)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Household info */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Household ID</span>
            <span className="font-mono text-slate-700 text-xs">{household.id}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Owner</span>
            <span className="font-mono text-xs text-slate-700">{shortenAddress(household.owner)}</span>
          </div>
          <Separator />
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Status</span>
            <Badge variant={household.active ? 'success' : 'secondary'}>
              {household.active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Add member dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              Enter their Stellar address and a display name.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddMember} className="space-y-4" noValidate>
            <Input
              label="Stellar address"
              placeholder="GABCDEF…"
              value={newAddress}
              onChange={e => { setNewAddress(e.target.value); setAddrError('') }}
              error={addrError}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <Input
              label="Display name"
              placeholder="e.g. Alice"
              value={newName}
              onChange={e => { setNewName(e.target.value); setNameError('') }}
              error={nameError}
              maxLength={32}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" loading={addLoading}>Add Member</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove confirm dialog */}
      <Dialog open={!!removeTarget} onOpenChange={open => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.displayName}?</DialogTitle>
            <DialogDescription>
              They will be removed from the household. Outstanding balances will remain.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemoveMember}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
