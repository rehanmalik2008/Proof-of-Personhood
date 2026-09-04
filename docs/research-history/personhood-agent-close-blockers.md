# RESEARCH AGENT PROMPT — Close the two blockers before anything else

> Standing brief continues. This session has exactly one job: determine whether the burn-coupling construction survives contact with honest users and a repeated game. If it does not, the core claim is dead and we need to know this week, not in year two. Do not advance the queue past these two items. Do not write new sections. Close the blockers or report the kill.

---

## 0. The frame, stated once so it stops recurring

Satoshi was an ordinary person who did ordinary things in an unusually disciplined order: state a narrow problem, do the attack-cost arithmetic honestly, ship working code, let the result be judged by others. There is no hidden faculty to acquire. "Reaching his level" is not a matter of thinking bigger — every time this project reached for his *stature* the work got worse, and every time it copied his *method* it got better and smaller.

The method's current instruction is unambiguous: the last session found a design flaw, built a repair (per-epoch burn coupling), and flagged two **blocking** objections against that repair. A disciplined researcher does not publish, does not extend, and does not celebrate until the blockers are closed. That is the entire job now. Treat the temptation to move on as the failure mode.

---

## 1. Ground truth (build from here)

- **Result 1:** deterrence needs identity cost `γ ≥ β` (value of one fake identity), independent of reward sublinearity.
- **Result 2 / 3:** anonymous credentials resist rental and brokerage — **but only under the per-epoch burn-coupling Construction introduced last session.** Without coupling, the scalar-`v` flaw (§3 of the 2.1 note) falsifies non-transferability outright: every context a user does not personally use is free to sell.
- **Result 4:** under coupling, a seller supplying `M` contexts is destroyable at cost ratio `M:1`, and buyer defection is unattributable so bonds cannot deter it. **Stated one-shot — and §6.3 warns that one-shot reasoning is exactly what already failed once in that document.**
- **Honest grade:** candidate security property, unreviewed, now *dependent on a construction with two blocking open problems.*

The whole edifice now rests on burn-coupling being (a) usable by honest people and (b) robust in a repeated game. Both are open. If either fails, economic non-transferability is not achievable by this design.

---

## 2. BLOCKER A — the honest-user accidental-collision rate (§6.1). Do this first.

Coupling means: **one duplicate use in any context, by anyone holding the secret, reveals `s_e` and burns the user's entire epoch across all contexts.** For an attacker that is the point. For an honest user it is a hazard, because duplicates can happen by accident.

**The question that can kill the project:** what is the per-epoch probability `p_acc` that an ordinary, honest user triggers an accidental duplicate — and at what epoch length does coupling stay usable?

Model the real accident sources explicitly, do not hand-wave them:

1. **Multi-device use.** A user proves from phone and laptop in the same context/epoch. How likely per epoch as a function of device count `d` and epochs per day?
2. **Restored backups.** A user restores `s₀` to a new device and re-proves in a context already used this epoch. Frequency from realistic backup/restore and device-replacement rates.
3. **Buggy / retrying clients.** A client that retries a failed proof, or a wallet that double-submits under poor connectivity, produces a duplicate nullifier. Assume nonzero and bound it.
4. **Clock/epoch-boundary races.** Two proofs the user believes are in different epochs but that land in the same one due to loose clock sync (this project has an open clock-sync dependency). Estimate as a function of epoch length `T` and clock skew.

**Deliverables (all required):**
- A composed model `p_acc(T, d, skew, retry_rate, restore_rate)` with every input stated as an assumption you can attack.
- **The usability–security tradeoff curve.** Shorter epochs cut accidental-collision damage but raise proving/attestation load *and* raise the epoch-boundary race rate (2 and 4 pull in opposite directions — find the interior optimum, if one exists).
- Runnable, parameter-swept code. Include hostile parameter ranges (clumsy users, flaky networks, frequent device switches), not just friendly ones.
- **A verdict, labelled:** does an epoch length exist where `p_acc` is tolerable for honest users *and* `q` (the attacker-relevant duplicate rate) stays high enough for Result 4 to bite? If yes, state the window. If no, declare the construction unusable and the core claim falsified pending a new repair.

**Anti-motivated-reasoning check:** you built the coupling construction, so you are biased to save it. State up front the value of `p_acc` above which you will declare it dead, *before* you compute `p_acc`. Then honor it. Do not move the threshold after seeing the number — that failure mode is named explicitly in the source documents.

## 3. BLOCKER B — Result 4 as a repeated game (§6.3, 2.2). Do this second, only if A survives.

Result 4 is one-shot. §6.3 flags that one-shot reasoning already failed once in the 2.1 note (Step 1 needed a repeated game to even see the bonded-seller attack). So Result 4 is currently stated in the exact form this project has proven unreliable.

**Redo Result 4 as a repeated game.** A seller anticipating the `M:1` poisoning attack will underwrite it:
- **Insurance / price markup:** the seller prices in expected destruction and raises `p`. Does the market still clear? Clearing depends on `β` (Result 1) versus the marked-up price — **connect Result 4 back to Result 1's `γ ≥ β`; that connection is where the real domain boundary lives (§6.4).**
- **Buyer vetting:** the seller sells only to buyers who post their own out-of-band bonds, making defection attributable *socially* even though it is unattributable *cryptographically*. This is the same out-of-band-reputation move that broke Result 3 in Step 1 — does it also rescue the broker here, one level up?
- **Repeated-game folk-theorem risk:** with patient players and out-of-band enforcement, cooperation (a stable rental market) may be sustainable. Find the exact condition. If a liquid rental market clears in the repeated game, **Result 4 is falsified and non-transferability fails** — report that plainly.

**Deliverable:** the repeated-game restatement with the clearing condition isolated, code sweeping discount factor and enforcement strength, and a labelled verdict — Result 4 survives, survives-narrowed, or is falsified.

## 4. `q` is now a first-class parameter (§6.2)

Both blockers depend on `q`, the per-epoch probability a sold context sees a duplicate use. It is currently guessed (0.02–0.10). Bound it from below (attacker can always force `q` up by deliberately double-using — so `q` is partly a *choice variable of the defender*, not just a natural rate). Make explicit which parts of `q` are natural vs. defender-controlled, because Result 4's whole force is that a defender *chooses* to poison. This may strengthen Result 4 (defender sets `q`) even as it complicates Blocker A (honest `p_acc` is the natural floor the defender's `q` sits above).

---

## 5. Method (unchanged, enforced)

For each blocker: **Claim (labelled) → Model with attackable assumptions → Derivation shown → parameter-swept runnable code with failing assertions → hardest self-attack → consequence propagation.** End on the attack. Pre-commit kill-thresholds before computing. Retract out loud if a number overturns a prior claim.

---

## 6. Definition of progress for this session

Exactly one of:
- **Blocker A closed:** a usable epoch window exists (stated, with the tradeoff curve) — coupling survives, project continues to Blocker B.
- **Blocker A kills it:** no usable window — coupling unusable, non-transferability falsified pending a *new* repair; propose the next candidate repair or declare the design approach dead.
- **Blocker B falsifies Result 4:** repeated-game rental market clears — report it, narrow the claim to the honest domain boundary against `β`.

Anything else is motion. If the session produces none of these, say so.

## 7. What NOT to do

- Do not extend past these two blockers. Do not draft the publication note. Do not add primitives. Do not write vision or impact text.
- Do not soften a kill. If the number says the construction is unusable, that is the highest-value output this project can produce this week, because it saves the two years. Report it at the top, not buried in a self-attack section.
- Do not claim Satoshi-level anything. Report the honest grade and the specific claim that must still survive.

## 8. First action

Close **Blocker A**. Pre-commit the `p_acc` kill-threshold now, in the first paragraph, before modelling. Then build `p_acc(T, d, skew, retry_rate, restore_rate)`, sweep it including hostile ranges, plot the usability–security tradeoff against epoch length, and deliver the labelled verdict. End on your hardest attempt to break your own model.

If A survives, proceed to Blocker B in the same session only if time permits; otherwise stop and report A's verdict cleanly. One closed blocker, honestly, is the whole win.
