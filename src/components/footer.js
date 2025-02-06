import React from 'react';
import './footer.css';
import Logo from '../assets/logo.svg';

export default function Footer() {
    return (
        <footer className='footer'>
            <div className='footer-content'>
                <div className="footer-logo-section">
                    <img src={Logo} alt="GDSC USTP Logo" className="footer-logo" />
                    <div className="footer-logo-text">
                        <h3>Google Developer Student Clubs</h3>
                        <p>University of Science and Technology of Southern Philippines</p>
                    </div>
                </div>
                
                <div className="footer-sections">
                    <div className="footer-section">
                        <h4>Everything</h4>
                        <p>Lorem ipsum dolor sit</p>
                        <p>Lorem ipsum dolor sit</p>
                        <p>Lorem ipsum dolor sit</p>
                        <p>Lorem ipsum dolor sit</p>
                    </div>
                    <div className="footer-section">
                        <h4>Everything</h4>
                        <p>Lorem ipsum dolor sit</p>
                        <p>Lorem ipsum dolor sit</p>
                        <p>Lorem ipsum dolor sit</p>
                        <p>Lorem ipsum dolor sit</p>
                    </div>
                    <div className="footer-section">
                        <h4>Everything</h4>
                        <p>Lorem ipsum dolor sit</p>
                        <p>Lorem ipsum dolor sit</p>
                        <p>Lorem ipsum dolor sit</p>
                        <p>Lorem ipsum dolor sit</p>
                    </div>
                </div>
            </div>
            
            <div className="footer-bottom">
                <div className="footer-bottom-content">
                    <p>&copy; GDSC-USTP All Rights Reserved</p>
                    <div className='footer-links'>
                        <a href="#" className='footer-link'>Privacy Policy</a>
                        <a href="#" className='footer-link'>Terms of Use</a>
                        <a href="#" className='footer-link'>Sitemap</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
