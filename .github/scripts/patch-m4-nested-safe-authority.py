from pathlib import Path
import sys


if len(sys.argv) != 2:
    raise SystemExit('usage: patch-m4-nested-safe-authority.py <audit-script>')

path = Path(sys.argv[1])
content = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global content
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    content = content.replace(old, new, 1)


replace_once(
    """const SAFES = [
  {
    issueNumber: 90,
    label: 'controller-executor-safe',
    address: getAddress('0x6b9F63817F1442e40Bb9c3C2207758934C323FdC'),
  },
  {
    issueNumber: 93,
    label: 'timelock-governance-safe',
    address: getAddress('0x4C0360aFedD31e53718e4343F95E40b692402462'),
  },
]
""",
    """const SAFES = [
  {
    issueNumber: 99,
    label: 'shared-nested-safe-owner',
    address: getAddress('0x3A0C507Cc7F8785C877359ad49d0476966d17a1C'),
  },
]
""",
    'nested Safe target',
)

replace_once(
    "const PINNED_FALLBACK_HANDLER_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5'\n",
    """const PINNED_FALLBACK_HANDLER_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5'
const EXPECTED_FALLBACK_HANDLER = getAddress('0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99')
const EXPECTED_FALLBACK_HANDLER_LENGTH = 5_637
const EXPECTED_FALLBACK_HANDLER_HASH = '0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9'
""",
    'canonical fallback handler pins',
)

replace_once(
    """  if (state.version !== EXPECTED_SAFE_VERSION) reasons.push('unexpected-safe-version')
  return { valid: reasons.length === 0, reasons }
""",
    """  if (state.version !== EXPECTED_SAFE_VERSION) reasons.push('unexpected-safe-version')
  if (state.fallbackHandler !== EXPECTED_FALLBACK_HANDLER) reasons.push('unexpected-fallback-handler')
  return { valid: reasons.length === 0, reasons }
""",
    'fallback address validation',
)

replace_once(
    """  const relatedAgreement = relatedEvidence.every((entry) => entry.agreement)
  const authorityBoundaries = relatedEvidence
    .filter((entry) => entry.classification !== 'eoa')
""",
    """  const relatedAgreement = relatedEvidence.every((entry) => entry.agreement)
  const fallbackEvidence = relatedEvidence.find((entry) => entry.address === EXPECTED_FALLBACK_HANDLER) ?? null
  const canonicalFallbackHandler =
    state?.fallbackHandler === EXPECTED_FALLBACK_HANDLER &&
    fallbackEvidence?.agreement === true &&
    fallbackEvidence.providers.every(
      (provider) =>
        provider.code.hasCode &&
        provider.code.byteLength === EXPECTED_FALLBACK_HANDLER_LENGTH &&
        provider.code.bytecodeHash === EXPECTED_FALLBACK_HANDLER_HASH,
    )
  const authorityBoundaries = relatedEvidence
    .filter((entry) => entry.classification !== 'eoa' && entry.address !== EXPECTED_FALLBACK_HANDLER)
""",
    'canonical fallback handler gate',
)

replace_once(
    """    providerAgreement &&
    validation.valid &&
    relatedAgreement
""",
    """    providerAgreement &&
    validation.valid &&
    relatedAgreement &&
    canonicalFallbackHandler
""",
    'verified fallback requirement',
)

replace_once(
    """    validation,
    relatedEvidence,
    relatedAgreement,
    authorityBoundaries,
""",
    """    validation,
    relatedEvidence,
    relatedAgreement,
    canonicalFallbackHandler,
    authorityBoundaries,
""",
    'Safe result fallback evidence',
)

replace_once(
    """    fallbackHandlerSlot: PINNED_FALLBACK_HANDLER_SLOT,
  },
""",
    """    fallbackHandlerSlot: PINNED_FALLBACK_HANDLER_SLOT,
    fallbackHandler: {
      address: EXPECTED_FALLBACK_HANDLER,
      byteLength: EXPECTED_FALLBACK_HANDLER_LENGTH,
      bytecodeHash: EXPECTED_FALLBACK_HANDLER_HASH,
    },
  },
""",
    'result fallback provenance',
)

path.write_text(content)
