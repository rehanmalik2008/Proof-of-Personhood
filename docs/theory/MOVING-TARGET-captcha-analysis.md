# Can a moving-target challenge outpace learning?

**Task 3 of `the-twenty-watt-argument.md`: attack falsification #2.** The
self-defeating property (TRILEMMA §8.4 / `the-twenty-watt-argument.md` §3): a
deployed cognitive distinguisher emits the labelled corpus that trains its own
solver. It **fails** if a challenge's solve-instances are not usable training
data — e.g. the target function is re-randomized faster than it can be learned.
If a viable such construction exists, it reopens REDUCTION Theorem 1 and is a
major finding.

## Verdict

**No viable construction found, and there is a structural reason to expect none.**
The requirement "a human solves it in sub-second wall-clock time" and the
requirement "an online learner with a large sample budget cannot track the
re-randomization" pull on the *same* quantity — how much fast-exploitable
structure each instance carries — in opposite directions. Every proposed
moving-target / adaptive / procedural CAPTCHA design surveyed collapses into one
of the two failure modes in §3. This is a **grounding argument**, not a proof
(§5): a formal human-solvable-but-drift-unlearnable separation is not ruled out,
it is just absent from the literature and structurally hard to see how to build.

The self-defeating property therefore stands, and TRILEMMA §8.4 cites this file.

---

## 1. The construction space, surveyed

| approach | representative work | why it does not escape |
|---|---|---|
| **Adversarial-perturbation images** — noise that fools CNNs, not humans | Osadchy et al., *No Bot Expects the DeepCAPTCHA!*, IEEE TIFS 2017; Shi et al., *Adversarial CAPTCHAs*, IEEE T-Cybernetics 2021 (survey) | Perturbations are defeated by adversarial training, input preprocessing/denoising, and adaptive (white-box or transfer) attacks. The defender must fix a perturbation budget that keeps humans able to solve; attackers train against exactly that budget. Documented arms race, has gone to the attacker as models became robust. |
| **Rotating catalogue of puzzle types** — 3D object rotation, icon matching, mini-games; "adaptive difficulty" | Arkose Labs FunCaptcha; hCaptcha task rotation; Mohamed et al., *dynamic cognitive game CAPTCHA*, 2014 | The catalogue is finite. A multi-head solver learns each type once; rotation among `k` types costs the attacker a `k`× one-time training expense, not a recurring one. Vendors' real defence is device/behavioural/rate layers, not the puzzle. |
| **Procedural generation from a fixed generator** — templated text, synthetic scenes, parametric distortion | classic text-CAPTCHA distortion pipelines; synthetic-scene VQA challenges | The generator defines a fixed distribution. Ye et al., *Yet Another Text Captcha Solver: a GAN approach*, ACM CCS 2018, is the existence proof: train the solver on the generator's own output. Re-drawing parameters samples the same space the attacker trains on. |
| **Epoch-rotated human-authored sets** | Idena flips | The cognitive task (order the coherent narrative) is fixed; only the instances rotate. Flip-solving ML has improved; Idena periodically hardens flips in response — the §2.4 pattern. |
| **"AI-hard" semantic challenges** — describe the scene, common-sense QA, visual reasoning | the original von Ahn et al. framing, EUROCRYPT 2003 | This was *the* robustness bet. It is now the most thoroughly solved category (multimodal LLMs at or above median human on the standard benchmarks, 2023–2025). |
| **Moving-target defence (MTD) applied to challenge distribution** — rotate the target concept faster than convergence | discussed informally in blog/forum posts; MTD formalism from systems security (Zhuang et al. surveys) | No published construction with a learning-theoretic convergence-rate argument. §2 explains why the informal idea does not turn into one. |

No surveyed design comes with a *hardness argument* (a reduction from a standard
hard problem, or a proof that learning the solver under the stated
re-randomization is intractable). All have empirical validity windows.

---

## 2. Can re-randomization outpace learning, in principle?

Frame it as online learning under concept drift. Each epoch `t` the defender
picks a target concept `f_t` from a family `F`; the attacker runs an online
learner against the stream of `(challenge, honest response)` pairs that
deployment produces.

### 2.1 The learner's sample budget is enormous

A CAPTCHA popular enough to matter for an identity layer sees **10⁶–10⁸ honest
solves per day** (reCAPTCHA-scale is higher). Each is a labelled example. So the
per-epoch sample budget `S` available to the attacker is very large, and it
scales with exactly the adoption that makes the challenge worth attacking.

### 2.2 Low-complexity `F`: learned in aggregate, rotation gives nothing

If `F` has finite VC dimension `d` (or is a finite catalogue of `k` types, or a
parametric family with a `d`-dimensional parameter), then a PAC/online learner
reaches accuracy `1 − ε` on **all of `F`** after `O(d / ε)` labelled examples —
not per `f_t`, but once. With `S ≫ d/ε` (always true at scale for any `F` a human
can be taught to solve), the attacker ends up holding a solver for the whole
family. Re-randomizing `f_t` within `F` then does nothing: every future instance
is already covered. This is the regime every design in §1 lives in — procedural
generators, type catalogues, distortion parameter spaces are all
finite-dimensional.

### 2.3 High-complexity `F`: defeats the learner, and also the human

For rotation to outpace a learner with budget `S`, each `f_t` must carry
`ω(S)` bits of *fresh, must-be-learned-anew* structure — structure with no
regularity the learner can carry over from epoch `t−1`.

But the challenge must still satisfy deployability requirement (i): a human on a
commodity device solves `f_t` in `T_H ≈ 200 ms`. By the resource bound
(TRILEMMA §8.1) the human's solve is a `≈ 4 J`, `≈ 0.2 s` procedure. A procedure
that cheap and that fast works by exploiting **fast-perceptible regularity** in
the instance — edges, gestalt grouping, familiar categories, a learned prior.
That regularity is precisely what an online learner extracts and carries across
re-randomizations.

The dilemma, sharply:

- If `f_t` has fast-perceptible regularity (so a human solves it in 200 ms), a
  learner with budget `S` extracts that regularity and generalizes across the
  rotation → regime 2.2, rotation fails.
- If `f_t` genuinely has no carry-over structure (so the learner must start
  fresh each epoch), then it has no fast-perceptible regularity either, and the
  human cannot solve it in `T_H` → requirement (i) fails, the challenge is not
  deployable.

"Human-solvable in 200 ms" and "unlearnable under drift by a high-sample-budget
learner" are governed by the same parameter — exploitable structure per instance
— and asked to point in opposite directions.

### 2.4 The verifier-efficiency constraint closes the last gap

Suppose one tries "each `f_t` is a fresh instance of a hard problem." Requirement
(ii): the verifier checks responses efficiently, inside a protocol. That needs
either (a) a trapdoor — but then it is a cryptographic puzzle, not a cognitive
one; a machine with the trapdoor solves it, and the trapdoor holder is an
institution; or (b) the problem is in P for the verifier's check but the *solve*
is meant to be hard — a gap that, for anything a human does in 200 ms, §2.3
already rules out. And the re-randomization process itself must be public and
trapdoor-free, or it reintroduces an institution.

---

## 3. The two failure modes, restated

Every moving-target design collapses to one:

1. **Aggregate-learnable.** `F` is low-complexity; deployment's sample volume
   learns the whole family; rotation within it is free for the attacker. (§1
   rows 1–5; §2.2.)
2. **Not human-fast-solvable.** `F` is complex enough that per-epoch
   re-randomization genuinely resets the learner — but then instances lack the
   fast-perceptible regularity that a sub-second human solve requires, so the
   challenge is not deployable. (§2.3.)

Adaptive difficulty, adversarial perturbation, and procedural generation are all
attempts to sit between these, and each has been pushed back into mode 1 by
adaptive attacks / solver training on the generator.

---

## 4. If a construction *did* escape

It would still face:

- **Economic inversion** (TRILEMMA §8.6): it would have to make the machine path
  *cost* more than the human path, not merely be harder; currently no cognitive
  challenge does.
- **Self-defeat via the re-randomizer**: if the rotation is driven by a public
  seed, the attacker replays the seed to generate unlimited training instances
  offline, decoupling learning from deployment volume entirely.
- It would reopen REDUCTION Theorem 1 and merit top-billing. This file would be
  revised to lead with it.

None of the surveyed designs get far enough to face these.

---

## 5. Honest caveats

- §2.3's bridge — "fast-perceptible regularity a human uses" ≈ "structure a
  learner generalizes" — is informal. It is well-supported (it is why ML solved
  the whole CAPTCHA family) but not a theorem. A genuine surprise would be a
  challenge with a *formal* separation: a fast human heuristic provably specific
  to each re-randomization. I could not construct one and none is proposed; the
  heuristic being fast and general is, structurally, the same thing as it
  generalizing.
- "Large sample budget" assumes wide deployment. A niche, low-volume challenge
  starves the learner — but a niche identity layer is not an identity layer, and
  §4's seed-replay point removes even that shelter when the re-randomizer is
  public.
- This is falsification #2 of `the-twenty-watt-argument.md` §8; it remains, in
  the source's words, "a genuinely open question" in the sense that no proof
  closes it. The survey and the §2 argument are why the answer is very likely
  "no".

---

## References

- L. von Ahn, M. Blum, N. Hopper, J. Langford. *CAPTCHA: Using Hard AI Problems
  for Security.* EUROCRYPT 2003.
- M. Osadchy, J. Hernandez-Castro, S. Gibson, O. Dunkelman, D. Pérez-Cabo.
  *No Bot Expects the DeepCAPTCHA! …* IEEE TIFS 2017.
- G. Ye, Z. Tang, D. Fang, et al. *Yet Another Text Captcha Solver: A Generative
  Adversarial Approach.* ACM CCS 2018.
- P. Shi et al. *Adversarial CAPTCHAs.* IEEE Transactions on Cybernetics, 2021
  (survey).
- H. Zhuang, S. Zhang, et al. Moving-target-defence surveys (systems security),
  2014–2019.
- Idena flip-ceremony documentation; Arkose Labs / hCaptcha product
  documentation (accessed 2025–2026; cited as deployed behaviour).
