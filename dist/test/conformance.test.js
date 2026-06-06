import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeConformance, DEFAULT_CONFORMANCE_CONFIG, designTokensToContract } from '../lib/conformance.js';
function live({ palette = [], semantic = {}, styles = [], spacing = [], radius = [], shadows = [] } = {}) {
    return {
        colors: { palette: palette.map((normalized) => ({ normalized })), semantic },
        typography: { styles },
        spacing: { commonValues: spacing.map((px) => ({ px })) },
        borderRadius: { values: radius.map((value) => ({ value })) },
        shadows: shadows.map((shadow) => ({ shadow })),
    };
}
test('a contract fully satisfied by live is conformant with score 0', () => {
    const contract = { palette: ['#ff0000'], fontFamilies: ['Inter'], fontSizes: ['16px'], spacing: ['8px'] };
    const candidate = live({
        palette: ['#ff0000'],
        styles: [{ fontFamily: 'Inter', fontSize: '16px' }],
        spacing: ['8px'],
    });
    const r = computeConformance(contract, candidate);
    assert.equal(r.score, 0);
    assert.equal(r.status, 'conformant');
});
test('a declared color missing from live is a violation', () => {
    const contract = { palette: ['#ff0000', '#00ff00'] };
    const candidate = live({ palette: ['#ff0000'] });
    const r = computeConformance(contract, candidate);
    assert.equal(r.summary.violated, 1);
    assert.equal(r.violations[0].category, 'color');
    assert.equal(r.violations[0].token, '#00ff00');
});
test('conformance is one-directional: extra live tokens are not violations', () => {
    const contract = { palette: ['#ff0000'] };
    const candidate = live({ palette: ['#ff0000', '#00ff00', '#0000ff'] });
    const r = computeConformance(contract, candidate);
    assert.equal(r.score, 0);
    assert.equal(r.status, 'conformant');
});
test('a near-identical color within colorSame counts as satisfied', () => {
    const contract = { palette: ['#ff0000'] };
    const candidate = live({ palette: ['#fe0000'] });
    const r = computeConformance(contract, candidate);
    assert.equal(r.summary.violated, 0);
});
test('semantic colors in the contract are checked against live palette and semantics', () => {
    const contract = { colors: { primary: '#123456' } };
    const candidate = live({ semantic: { primary: '#123456' } });
    assert.equal(computeConformance(contract, candidate).status, 'conformant');
});
test('a missing font family is a violation', () => {
    const contract = { fontFamilies: ['Inter', 'Roboto'] };
    const candidate = live({ styles: [{ fontFamily: 'Inter' }] });
    const r = computeConformance(contract, candidate);
    assert.equal(r.violations.filter((v) => v.category === 'fontFamily').length, 1);
});
test('font family matching ignores quotes, case and fallback stack', () => {
    const contract = { fontFamilies: ['Inter'] };
    const candidate = live({ styles: [{ fontFamily: '"Inter", sans-serif' }] });
    assert.equal(computeConformance(contract, candidate).status, 'conformant');
});
test('a font size within dimPct is satisfied, outside it is a violation', () => {
    const contract = { fontSizes: ['16px', '32px'] };
    const candidate = live({ styles: [{ fontSize: '16.5px' }, { fontSize: '40px' }] }); // 16.5 ok (~3%), 40 vs 32 = 25%
    const r = computeConformance(contract, candidate);
    const sizeViolations = r.violations.filter((v) => v.category === 'fontSize');
    assert.equal(sizeViolations.length, 1);
    assert.equal(sizeViolations[0].token, '32px');
});
test('shadow matching normalizes whitespace', () => {
    const contract = { shadows: ['0 1px 2px rgba(0,0,0,0.1)'] };
    const candidate = live({ shadows: ['0  1px   2px rgba(0,0,0,0.1)'] });
    assert.equal(computeConformance(contract, candidate).status, 'conformant');
});
test('failThreshold decides conformant vs violation', () => {
    const contract = { palette: ['#ff0000', '#00ff00', '#0000ff', '#111111'] };
    const candidate = live({ palette: ['#ff0000'] }); // 3 of 4 missing = 75%
    assert.equal(computeConformance(contract, candidate, { failThreshold: 80 }).status, 'conformant');
    assert.equal(computeConformance(contract, candidate, { failThreshold: 50 }).status, 'violation');
});
test('an empty contract is trivially conformant', () => {
    const r = computeConformance({}, live({ palette: ['#ff0000'] }));
    assert.equal(r.score, 0);
    assert.equal(r.summary.total, 0);
});
test('report is marked unweighted and carries the documented shape', () => {
    const r = computeConformance({ palette: ['#ff0000'] }, live({ palette: ['#ff0000'] }));
    assert.equal(r.mode, 'conformance');
    assert.equal(r.weighted, false);
    for (const key of ['score', 'status', 'threshold', 'summary', 'categories', 'violations']) {
        assert.ok(key in r, `report should include ${key}`);
    }
});
test('DEFAULT_CONFORMANCE_CONFIG exposes thresholds', () => {
    assert.equal(typeof DEFAULT_CONFORMANCE_CONFIG.colorSame, 'number');
    assert.equal(typeof DEFAULT_CONFORMANCE_CONFIG.failThreshold, 'number');
});
test('designTokensToContract maps DESIGN.md front matter to the contract shape', () => {
    const fm = {
        colors: { primary: '#133174' },
        typography: {
            'headline-display': { fontFamily: 'Inter', fontSize: '48px', fontWeight: 700 },
            body: { fontFamily: 'Inter', fontSize: '16px' },
        },
        spacing: { base: '8px', lg: '24px' },
        rounded: { sm: '4px', full: '9999px' },
    };
    const contract = designTokensToContract(fm);
    assert.deepEqual(contract.colors, { primary: '#133174' });
    assert.deepEqual(contract.fontFamilies, ['Inter']); // deduped
    assert.deepEqual(contract.fontSizes, ['48px', '16px']);
    assert.deepEqual(contract.spacing, ['8px', '24px']);
    assert.deepEqual(contract.borderRadius, ['4px', '9999px']);
});
test('a DESIGN.md-derived contract drives conformance like tokens.json', () => {
    const contract = designTokensToContract({
        colors: { primary: '#133174' },
        typography: { h1: { fontFamily: 'Inter', fontSize: '48px' } },
    });
    const candidate = live({ semantic: { primary: '#133174' }, styles: [{ fontFamily: 'Inter', fontSize: '48px' }] });
    assert.equal(computeConformance(contract, candidate).status, 'conformant');
});
//# sourceMappingURL=conformance.test.js.map