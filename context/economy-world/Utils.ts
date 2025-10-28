
/**
 * @returns a * x + b
 */
export function linearScaling(x: number = 1, a: number = 1, b: number = 0) {
    return a * x + b
}

/**
 * @returns a * x^2 + b * x + c
 */
export function quadraticScaling(x: number = 1, a: number = 1, b: number = 0, c: number = 0) {
    return a * x * x + b * x + c
}

/**
 * @returns a * sqrt(x) + b
 */
export function sqrtScaling(x: number = 1, a: number = 1, b: number = 0) {
    return a * Math.sqrt(x) + b
}

export const suffixes = ['', 'K', 'M', 'B', 'T', 'Q'];


/**
 * Format a number with a suffix (like 1.27M)
 * 
 * @param input - The raw number.
 * @param delta - Whether it should display a +/-
 * @returns Formatted string: prefix + number + suffix
 */
export function cleanNumberDisplay(amount: number, delta: boolean = false) {
    // 1. Handle negative numbers correctly by processing the absolute value.
    const isNegative = amount < 0;
    amount = Math.abs(amount);

    // 2. Define suffixes and their corresponding powers of 1000.
    let tier = 0
    if (amount != 0) {
        tier = Math.floor(Math.log10(amount) / 3);
    }

    // 3. Handle numbers that are too large for the defined suffixes.
    if (tier >= suffixes.length) {
        tier = suffixes.length-1
    }

    // 4. Calculate the truncated value.
    let precision = 0
    if (tier != 0) {
        if (amount / Math.pow(1000, tier) / 100 >= 1) {
            precision = 0
        }
        else if (amount / Math.pow(1000, tier) / 10 >= 1) {
            precision = 1
        }
        else {
            precision = 2
        }
    }

    const shortAmount = (amount / Math.pow(1000, tier)).toFixed(precision);

    // 5. Handle prefix
    let prefix = ''
    if (isNegative) {
        prefix = '-'
    }
    else if (delta) {
        prefix = '+'
    }
    // 6. Return the formatted string with the correct sign.
    return prefix + shortAmount + suffixes[tier];
}
