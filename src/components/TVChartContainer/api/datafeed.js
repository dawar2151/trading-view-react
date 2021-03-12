import {
	makeApiRequest,
	generateSymbol,
	parseFullSymbol,
} from './helpers.js';
import {
	subscribeOnStream,
	unsubscribeFromStream,
} from './streaming.js';

const lastBarsCache = new Map();

const configurationData = {
	supported_resolutions: ["1","15","30","D", "W"],
	exchanges: [{
		value: 'uniswapv2',
		name: 'Uniswap',
		desc: 'uniswap',
	}
	],
	symbols_types: [{
		name: 'crypto',

		// `symbolType` argument for the `searchSymbols` method, if a user selects this symbol type
		value: 'crypto',
	},
		// ...
	],
};

async function getAllSymbols() {
	const data = await makeApiRequest('data/v3/all/exchanges');
	let allSymbols = [];

	for (const exchange of configurationData.exchanges) {
		const pairs = data.Data[exchange.value].pairs;

		for (const leftPairPart of Object.keys(pairs)) {
			const symbols = pairs[leftPairPart].map(rightPairPart => {
				const symbol = generateSymbol(exchange.value, leftPairPart, rightPairPart);
				return {
					symbol: symbol.short,
					full_name: symbol.full,
					description: symbol.short,
					exchange: exchange.value,
					type: 'crypto',
				};
			});
			allSymbols = [...allSymbols, ...symbols];
		}
	}
	return allSymbols;
}

export default {
	onReady: (callback) => {
		console.log('[onReady]: Method call');
		setTimeout(() => callback(configurationData));
	},

	searchSymbols: async (
		userInput,
		exchange,
		symbolType,
		onResultReadyCallback,
	) => {
		console.log('[searchSymbols]: Method call');
		const symbols = await getAllSymbols();
		const newSymbols = symbols.filter(symbol => {
			const isExchangeValid = exchange === '' || symbol.exchange === exchange;
			const isFullSymbolContainsInput = symbol.full_name
				.toLowerCase()
				.indexOf(userInput.toLowerCase()) !== -1;
			return isExchangeValid && isFullSymbolContainsInput;
		});
		onResultReadyCallback(newSymbols);
	},

	resolveSymbol: async (
		symbolName,
		onSymbolResolvedCallback,
		onResolveErrorCallback,
	) => {
		console.log('[resolveSymbol]: Method call', symbolName);
		const symbols = await getAllSymbols();
		console.log(symbolName.split('/')[1]=='USD')
		const copySymbol = symbolName;
		if(copySymbol.split('/')[1]=='USD'){
			symbolName = 'uniswapv2:WETH/USDT'
		}
		const symbolItem = symbols.find(({
			full_name,
		}) => full_name === symbolName);
		if (!symbolItem) {
			console.log('[resolveSymbol]: Cannot resolve symbol', symbolName);
			onResolveErrorCallback('cannot resolve symbol');
			return;
		}
		const symbolInfo = {
			ticker: copySymbol.split('/')[1]=='USD'?copySymbol:symbolItem.full_name,
			name: copySymbol.split('/')[1]=='USD'?copySymbol:symbolItem.symbol,
			description: copySymbol.split('/')[1]=='USD'?copySymbol:symbolItem.description,
			type: symbolItem.type,
			session: '24x7',
			timezone: 'Etc/UTC',
			exchange: symbolItem.exchange,
			minmov: 1,
			pricescale: 100000000,
			intraday_multipliers: ['1', '60'],
			has_intraday: true,
			has_no_volume: true,
			has_weekly_and_monthly: true,
			supported_resolutions: configurationData.supported_resolutions,
			//volume_precision: 2,
			data_status: 'streaming',
		};

		console.log('[resolveSymbol]: Symbol resolved', symbolName);
		onSymbolResolvedCallback(symbolInfo);
	},

	getBars: async (symbolInfo, resolution, from, to, onHistoryCallback, onErrorCallback, firstDataRequest) => {
		console.log('[getBars]: Method call', symbolInfo, resolution, from, to);
		let token1 = (symbolInfo.full_name.split(':')[1]).split('/')[1];
		let token0 = (symbolInfo.full_name.split(':')[1]).split('/')[0];
		const parsedSymbol = parseFullSymbol(token1=='USD'?'uniswapv2:WETH/USDT':symbolInfo.full_name);
		let price;
		if(token1 == 'USD'){
			const getPrice = {
				e: 'uniswapv2',
				fsym: token0,
				tsyms: 'WETH',
			};
			price = await makeApiRequest('data/price?'+Object.keys(getPrice)
			.map(name => `${name}=${encodeURIComponent(getPrice[name])}`)
			.join('&'))
			console.log(price)
		}
		
		const urlParameters = {
			e: parsedSymbol.exchange,
			fsym: parsedSymbol.fromSymbol,
			tsym: parsedSymbol.toSymbol,
			toTs: to,
			limit: 2000,
		};
		const query = Object.keys(urlParameters)
			.map(name => `${name}=${encodeURIComponent(urlParameters[name])}`)
			.join('&');
		try {
			const url  = resolution === '1D' ? 'data/histoday' : resolution >= 60 ? 'data/histohour' : 'data/histominute'
			const data = await makeApiRequest(`${url}?${query}`);
			if (data.Response && data.Response === 'Error' || data.Data.length === 0) {
				// "noData" should be set if there is no data in the requested period.
				onHistoryCallback([], {
					noData: true,
				});
				return;
			}
			let bars = [];
			data.Data.forEach(bar => {
				if (bar.time >= from && bar.time < to) {
					bars = [...bars, {
						time: bar.time * 1000,
						low: token1=='USD'?bar.low*price.WETH:bar.low,
						high: token1=='USD'?bar.high*price.WETH:bar.high,
						open: token1=='USD'?bar.open*price.WETH:bar.open,
						close: token1=='USD'?bar.close*price.WETH:bar.close,
					}];
				}
			});
			if (firstDataRequest) {
				lastBarsCache.set(symbolInfo.full_name, {
					...bars[bars.length - 1],
				});
			}
			console.log(`[getBars]: returned ${bars.length} bar(s)`);
			onHistoryCallback(bars, {
				noData: false,
			});
		} catch (error) {
			console.log('[getBars]: Get error', error);
			onErrorCallback(error);
		}
	},

	subscribeBars: (
		symbolInfo,
		resolution,
		onRealtimeCallback,
		subscribeUID,
		onResetCacheNeededCallback,
	) => {
		console.log('[subscribeBars]: Method call with subscribeUID:', subscribeUID);
		subscribeOnStream(
			symbolInfo,
			resolution,
			onRealtimeCallback,
			subscribeUID,
			onResetCacheNeededCallback,
			lastBarsCache.get(symbolInfo.full_name),
		);
	},

	unsubscribeBars: (subscriberUID) => {
		console.log('[unsubscribeBars]: Method call with subscriberUID:', subscriberUID);
		unsubscribeFromStream(subscriberUID);
	},
};
