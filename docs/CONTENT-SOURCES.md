# TypeNews Content Library

The active development database contains 4,600 typing entries:

- Korean: 800 short sentences, 500 long passages, and 1,000 words
- English: 800 short sentences, 500 long passages, and 1,000 words

## Current Sentence Policy

Migration `0045_refresh_typing_library.sql` replaces the literary excerpts introduced
by migration `0044` with original, modern TypeNews prose. The active short and long
sentence pools do not contain excerpts from novels, poems, films, television programs,
animation, or song lyrics.

Korean sentence entries allow only Hangul, spaces, and basic punctuation. English
sentence entries allow only ASCII letters, spaces, and basic punctuation. Vocabulary
entries contain letters only. This keeps every entry predictable for the typing engine
and prevents language mixing or hard-to-enter symbols.

## Vocabulary

The expanded vocabulary pools were selected from language-frequency data and filtered
against the existing TypeNews words. Korean candidates were additionally checked with
a morphological analyzer so that the added entries are standalone nouns rather than
particles or conjugated endings.

The local reproducibility tools use:

- `wordfreq==3.1.1`
- `kiwipiepy==0.23.2`

No dictionary definitions or ordered dictionary entries are copied into the service.

## Migration History

Migration `0044_large_typing_library.sql` remains in the migration chain so a fresh
database can reproduce the same intermediate state. Migration `0045` must run after it
removes the imported literary excerpts. Migrations `0047` and `0048` are retained as
intermediate repairs for reproducible deployments. The final active library is defined
by `0049_editorial_sentence_review.sql`. It replaces all 1,720 generated Korean and
English short and long entries with individually written editorial copy. The active
source text is stored under `content/editorial/0049`; the migration builder does not
combine sentence templates or synthesize variations from shared fragments.

## Quotations From Popular Works

Modern film, television, animation dialogue, and song lyrics are not added merely
because an excerpt is short. There is no fixed character count that automatically
makes a quotation free to use, and in a typing library the quoted expression is the
primary content rather than supporting criticism or commentary.

Verbatim quotations may be added only when at least one of the following is recorded:

- direct permission from the relevant rights holder
- a reuse license whose terms cover this service
- verified expiration of the applicable copyright term

For every such entry, retain the work title, author or rights holder, source URL,
license or permission basis, and verification date outside the public sentence text.
The current cinematic-style entries are original TypeNews prose and are not presented
as quotations from existing works.

Official references:

- Korean Copyright Act, Article 28: https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025517657
- Korean Copyright Act, Article 39: https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029475235
- Korea Copyright Commission quotation guidance: https://www.copyright.or.kr/business/counsel/auto-advice-service/practice/detail.do?categorySeq=0&categoryType=&counselSeq=3300&parCategorySeq=
