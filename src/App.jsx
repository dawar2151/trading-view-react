import * as React from 'react';
import './App.css';
import { TVChartContainer } from './components/TVChartContainer/index';

class App extends React.Component {
	render() {
		return (
			<div className={ 'App' }>
				<header className={ 'App-header' }>
					<h1 className={ 'App-title' }>
						Uniswap tradingView	
					</h1>
				</header>
				<div style={{display:'flex',width:"100%", alignContent:"center",alignItems:"center"}}>
					<div style={{width:"50%", margin: '0 auto'}}>
						<TVChartContainer />
					</div>
				</div>
			</div>
		);
	}
}

export default App;
