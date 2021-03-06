import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import { init } from './store';
import App from './app/App';
import logger from 'redux-logger';
import getBaseName from './utils/getBaseName';
import { client } from './app/FetchingConfiguration';
import { ClientContextProvider } from 'react-fetching-library';

ReactDOM.render(
    <Provider store={ init(logger).getStore() }>
        <Router basename={ getBaseName(window.location.pathname) }>
            <ClientContextProvider client={ client }>
                <App/>
            </ClientContextProvider>
        </Router>
    </Provider>,

    document.getElementById('root')
);
