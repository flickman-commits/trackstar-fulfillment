# Proof Approval Flow Improvements

## What's Already Built (surprisingly solid)
After thorough review, the codebase already has:
- ✅ **Resend email integration** — `send-to-customer` action sends branded email with approval link
- ✅ **Send/Re-send buttons** in ProofManager (gated by designStatus)
- ✅ **`awaiting_review` status** with "Waiting for customer" banner
- ✅ **Customer feedback banner** shown prominently when `in_revision`
- ✅ **Stage progress bar** (Design → Review → Approved → Production)
- ✅ **Stage-based collapsible sections** (Design Info expanded when designing, Proofs expanded when reviewing)
- ✅ **PostApprovalChecklist** component with guided steps (Export PDF → Upload → Notify Eli)
- ✅ **Slack notifications**: comment added → Dan, customer approves → Dan + Eli, revision requested → Dan, sent to production → Eli
- ✅ **Token-based approval portal** with carousel, approve/revision flow
- ✅ `resend` npm package already installed

## Actual Remaining Gaps

### Gap 1: `concepts_done` status is an unnecessary manual step
**Problem**: Dan uploads proofs, then has to manually change status to `concepts_done` before the "Send Proofs" button appears. The flow should be: upload proofs → send to customer in one step. The `concepts_done` status is a leftover from the old email-based flow.

**Fix**: Allow "Send Proofs to Customer" button to show whenever there are pending proofs, regardless of whether status is `in_progress` or `concepts_done`. When Dan clicks send, status auto-advances to `awaiting_review`.

### Gap 2: No auto-advance of designStatus on proof upload
**Problem**: When Dan uploads proofs while in `not_started` or `in_progress`, the status stays put. He has to manually move it.

**Fix**: When proofs are uploaded and status is `not_started` or `in_progress`, auto-advance to `in_progress`. Not critical but reduces a manual step.

### Gap 3: PostApprovalChecklist doesn't actually update designStatus on PDF upload
**Problem**: The PostApprovalChecklist calls `onDesignStatusChange('final_pdf_uploaded')` but this only does a frontend state update via the parent. The actual API call to persist `final_pdf_uploaded` to the database only fires through `updateDesignStatus` which calls `api/orders/actions`. Looking at the code, `onDesignStatusChange` in Dashboard.tsx maps to `updateDesignStatus` which DOES call the API. So this actually works — ✅ confirmed.

### Gap 4: Mobile detail panel missing PostApprovalChecklist
**Problem**: The mobile custom order detail view shows proofs & comments but doesn't have the `PostApprovalChecklist`, stage progress bar, awaiting_review banner, or customer feedback banner. Dan uses his phone too.

**Fix**: Add these mobile sections to match desktop.

### Gap 5: The "Email Customer" mailto link is still showing
**Problem**: There's still an old `Email Customer` mailto link button at the bottom actions (line 2802) for `concepts_done` status. This is redundant now that we have the built-in email send via Resend.

**Fix**: Remove the old mailto button.

### Gap 6: Send button should show for `in_progress` too
**Problem**: `showSendButton` in ProofManager only shows for `concepts_done` and `in_revision`. Dan should be able to send directly from `in_progress` once he's uploaded proofs.

**Fix**: Update condition to also include `in_progress`.

### Gap 7: No auto-advance to `in_progress` when Dan starts uploading
**Problem**: When Dan uploads his first proof to an order that's `not_started`, nothing changes. It would be smoother if uploading auto-advances to `in_progress`.

**Fix**: After successful proof upload, if status is `not_started`, call `onDesignStatusChange('in_progress')`.

### Gap 8: Approval portal doesn't show "Request Changes" feedback input well on mobile
**Problem**: This is a polish item — the customer portal works but could be smoother. Not critical for this pass.

---

## Implementation Plan

### Change 1: Expand "Send Proofs" button visibility (ProofManager.tsx)
- Update `showSendButton` to include `in_progress` in the allowed statuses
- Line 272: `['in_progress', 'concepts_done', 'in_revision'].includes(designStatus || '')`

### Change 2: Auto-advance to `in_progress` on first proof upload (ProofManager.tsx)
- After successful upload in `uploadProofs()`, if `designStatus` is `not_started`, call `onDesignStatusChange?.('in_progress')`

### Change 3: Add mobile parity for stage-specific UI (Dashboard.tsx)
In the mobile custom order detail view (lines ~2474-2630), add:
- Stage progress bar (same as desktop, lines 2675-2689)
- Customer feedback banner when `in_revision` (already there at line 2540 ✅)
- Awaiting review banner (already there at line 2547 ✅)
- PostApprovalChecklist when `approved_by_customer` or `final_pdf_uploaded` (currently missing)
- Pass `designStatus`, `customerEmail`, `onDesignStatusChange`, `onLatestFeedback` to mobile ProofManager (currently missing some props)

### Change 4: Remove old "Email Customer" mailto button (Dashboard.tsx)
- Delete the mailto link block at lines 2802-2809
- The Resend-based send via ProofManager replaces this entirely

### Change 5: Clean up bottom actions for all stages (Dashboard.tsx)
- For `not_started` / `in_progress` / `concepts_done` / `awaiting_review` / `in_revision`: just show Close button (the ProofManager handles sending)
- For `approved_by_customer` / `final_pdf_uploaded`: PostApprovalChecklist (already done on desktop)
- For `sent_to_production`: "Reopen Order" + Close (already done)

---

## Files Modified
1. `src/components/ProofManager.tsx` — Changes 1, 2 (small)
2. `src/pages/Dashboard.tsx` — Changes 3, 4, 5 (medium)

## No API changes needed
Everything backend-side is already wired up correctly.
