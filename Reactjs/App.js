import React, {useState, useEffect} from 'react';
import {BrowserRouter, Route, Switch} from 'react-router-dom';
// components
import Layout from './components/header_navigation/Layout';
import HomePage from './pages/HomePage';
import EventIntro from './pages/EventIntroPage';
import PortalPage from './pages/PortalPage';
import AboutPage from './pages/AboutPage';
import InfoPage from './pages/InfoPage';

const App = () => {

  useEffect(() => {
    // check API/Backend for event and if there is one active, setActiveEvent state
  });

  const [activeEvent, setActiveEvent] = useState(true);
  
  return (
    <BrowserRouter>
      <Layout>
        <Switch>
          <Route 
            exact path='/' 
            render={props => 
            <HomePage {...props} activeEvent={activeEvent}/>
            }
            />
          <Route exact path='/intro' component={EventIntro}/>
          <Route exact path='/portal' component={PortalPage}/>
          <Route exact path='/about' component={AboutPage}/>
          <Route exact path='/info' component={InfoPage}/>
        </Switch>
      </Layout>
    </BrowserRouter>
  )
}

export default App;
