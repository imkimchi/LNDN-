import { chromium } from 'playwright';

async function testSpareRoomImages() {
    const browser = await chromium.launch({ 
        headless: false, // Set to true for headless mode
        slowMo: 1000 // Slow down actions for better visibility
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    const testUrl = 'https://www.spareroom.co.uk/flatshare/flatshare_detail.pl?flatshare_id=12983755&search_id=1376605561&city_id=&flatshare_type=offered&search_results=%2Fflatshare%2F%3Fsearch_id%3D1376605561%26sort_by%3Ddays_since_placed%26mode%3Dlist&';
    
    console.log('🚀 Starting SpareRoom image extraction test...');
    console.log('📍 URL:', testUrl);
    
    try {
        // Navigate to the page
        console.log('\n📱 Navigating to the page...');
        await page.goto(testUrl, { waitUntil: 'networkidle' });
        
        console.log('✅ Page loaded successfully');
        
        // Wait a bit for any dynamic content to load
        await page.waitForTimeout(3000);
        
        // Check if photo gallery thumbnail links exist
        console.log('\n🔍 Checking for .photo-gallery__thumbnail-link elements...');
        const thumbnailLinks = await page.$$('.photo-gallery__thumbnail-link');
        console.log(`Found ${thumbnailLinks.length} thumbnail links`);
        
        if (thumbnailLinks.length > 0) {
            console.log('\n👆 Attempting to click first thumbnail...');
            await thumbnailLinks[0].click();
            
            // Wait for modal to appear
            await page.waitForTimeout(2000);
            
            // Check for lightbox modal
            console.log('🔍 Looking for photo lightbox modal...');
            const lightboxImages = await page.$$('.photo-lightbox__image');
            console.log(`Found ${lightboxImages.length} lightbox images`);
            
            if (lightboxImages.length > 0) {
                console.log('\n📸 Extracting lightbox image URLs...');
                for (let i = 0; i < lightboxImages.length; i++) {
                    const src = await lightboxImages[i].getAttribute('src');
                    const dataSrc = await lightboxImages[i].getAttribute('data-src');
                    console.log(`Lightbox Image ${i + 1}:`);
                    console.log(`  src: ${src}`);
                    console.log(`  data-src: ${dataSrc}`);
                }
            }
            
            // Close modal if it exists
            const closeButton = await page.$('.photo-lightbox__close, .modal-close, [aria-label="Close"]');
            if (closeButton) {
                await closeButton.click();
                await page.waitForTimeout(1000);
            }
        }
        
        // Fallback approach - look for all img elements
        console.log('\n🔄 Fallback approach - looking for all img elements...');
        const allImages = await page.$$('img');
        console.log(`Found ${allImages.length} total img elements`);
        
        const relevantImages = [];
        for (let i = 0; i < allImages.length; i++) {
            const src = await allImages[i].getAttribute('src');
            const dataSrc = await allImages[i].getAttribute('data-src');
            const alt = await allImages[i].getAttribute('alt');
            
            // Check for images with 'photos/' or 'images/' in src
            if ((src && (src.includes('photos/') || src.includes('images/'))) ||
                (dataSrc && (dataSrc.includes('photos/') || dataSrc.includes('images/')))) {
                relevantImages.push({
                    src,
                    dataSrc,
                    alt,
                    index: i
                });
            }
        }
        
        console.log(`\n📷 Found ${relevantImages.length} relevant images:`);
        relevantImages.forEach((img, index) => {
            console.log(`Image ${index + 1}:`);
            console.log(`  src: ${img.src}`);
            console.log(`  data-src: ${img.dataSrc}`);
            console.log(`  alt: ${img.alt}`);
            console.log('---');
        });
        
        // Look for specific SpareRoom image patterns
        console.log('\n🎯 Looking for SpareRoom-specific image patterns...');
        const spareRoomImages = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img'));
            return images
                .map(img => ({
                    src: img.src,
                    dataSrc: img.getAttribute('data-src'),
                    className: img.className,
                    alt: img.alt,
                    parentClasses: img.parentElement ? img.parentElement.className : ''
                }))
                .filter(img => 
                    img.src?.includes('spareroom') || 
                    img.src?.includes('photos') ||
                    img.className?.includes('photo') ||
                    img.parentClasses?.includes('photo') ||
                    img.alt?.toLowerCase().includes('photo')
                );
        });
        
        console.log(`Found ${spareRoomImages.length} SpareRoom-specific images:`);
        spareRoomImages.forEach((img, index) => {
            console.log(`SpareRoom Image ${index + 1}:`);
            console.log(`  src: ${img.src}`);
            console.log(`  data-src: ${img.dataSrc}`);
            console.log(`  className: ${img.className}`);
            console.log(`  parentClasses: ${img.parentClasses}`);
            console.log(`  alt: ${img.alt}`);
            console.log('---');
        });
        
        // Check page structure for photo-related elements
        console.log('\n🏗️ Analyzing page structure for photo elements...');
        const photoElements = await page.evaluate(() => {
            const selectors = [
                '.photo-gallery',
                '.photo-gallery__thumbnail',
                '.photo-gallery__thumbnail-link',
                '.photo-lightbox',
                '.photo-lightbox__image',
                '[class*="photo"]',
                '[class*="image"]',
                '[class*="gallery"]'
            ];
            
            const results = {};
            selectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    results[selector] = elements.length;
                }
            });
            
            return results;
        });
        
        console.log('Photo-related elements found:');
        Object.entries(photoElements).forEach(([selector, count]) => {
            console.log(`  ${selector}: ${count} elements`);
        });
        
        // Take a screenshot for reference
        console.log('\n📸 Taking screenshot for reference...');
        await page.screenshot({ 
            path: '/Users/sherwooz/srbot/spareroom-test-screenshot.png',
            fullPage: true 
        });
        console.log('Screenshot saved as spareroom-test-screenshot.png');
        
    } catch (error) {
        console.error('❌ Error during test:', error);
    } finally {
        await browser.close();
        console.log('\n✅ Test completed');
    }
}

// Run the test
testSpareRoomImages().catch(console.error);