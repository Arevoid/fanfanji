# Memory Admission V2 synthetic fixture namespace policy

Development fixtures are isolated by an explicit `syntheticFixtureId` namespace.
The namespace is optional on ordinary production records and is persisted only
on dev/test synthetic identities, Characters, and relationships.

Each fixture owns its own identity, canonical Character id, relationship id,
conversation id, and manifest lineage. A fixture may treat only records with
its own `syntheticFixtureId` as duplicates. Other synthetic lineages (for
example `stage4d11o-dedicated-direct`) are preserved and ignored; their
messages, markers, Memory, accounting, and Campaign evidence are never
renamed, merged, reset, or imported.

The shared synthetic bio remains a human-readable dev marker, not an ownership
key. Legacy R4B records created before namespace metadata are selected only by
their explicit legacy fixture selector. New fixtures must always write their
namespace metadata at creation time.

`devPortableFixtureManifest` remains a single-instance manifest for
`stage4d3-portable`; its fingerprints describe only that namespace and it must
never read or overwrite another fixture's governance or evidence metadata.

The namespace boundary is covered by deterministic tests for empty bootstrap,
unrelated synthetic fixtures, duplicate portable identities, same-bio/different
lineage records, exact relation/conversation isolation, and production
non-installation of the dev API.
