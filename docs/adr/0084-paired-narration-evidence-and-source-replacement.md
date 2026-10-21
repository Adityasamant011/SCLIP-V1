# 0084: Pair narration evidence with the actual authored footage

Status: accepted

A project-99 follow-up finished with a false alignment claim: a bakery line accompanied an Eiffel Tower shot, and dinner narration preceded the escargot footage. Separate sparse visual samples and an independently recognized transcript failed to expose the same instant to the reviewing agent.

`inspect_audio_visual_alignment` obtains current rendered-mix recognition, intersects speech with directly authored footage intervals, observes bounded representative frames of those intervals, and returns the paired evidence without inventing a semantic match verdict. Current paired evidence is required for completion of a recognized narrated-video request. Speech-bearing direct footage intervals are sampled, not continuously certified; more than twelve instants is explicitly partial. Nested or graphics-only narration requires an explicit unavailable outcome until supported. ASR and local frame recognition remain fallible.

Follow-up revisions preserve recognized duration/narration requirements unless the user explicitly changes audio intent. Teaser/trailer/montage words identify video. Existing authored visuals survive an added narration mention. Complete video delivery must decode video, not only audio.

Source replacement is an explicit `replace_source` member of the existing atomic repair transaction. It preserves layer identity, envelope, links, mix settings and transform, changing only the named source/window. Audio partners are never inferred; name them separately when desired. It validates streams, locks, bounds and coverage before the single existing actor commit. An unused media import changes no authored output and consumes no repair attempt; the host may rebase review identity only after confirming unchanged output.

HyperFrames is the primary authoring path for designed graphics in the compact execution contract; native Text remains valid for captions, exact fixes and deliberate fallback. This preference does not force decorative animation over relevant footage or certify the agent's creative choices.
