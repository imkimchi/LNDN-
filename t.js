import axios from 'axios';
import https from 'https'

const agent = new https.Agent({
    rejectUnauthorized: false
});

const fetchListingData = async () => {
    try {
        const response = await axios.post(
            'https://api-graphql-lambda.prod.zoopla.co.uk/graphql',
            {
                operationName: 'getListingData',
                variables: { path: "/to-rent/property/london/" },
                query: getQuery(),
            },
            {
                headers: {
                    'x-api-key': 'public-1dH5DwBExsUKpdQGs6koWePJO7zeHyDb',
                    'Content-Type': 'application/json'
                },
                // withCredentials: true,
                httpsAgent: agent
            }
        );

        console.log('Data:', response.data);
        
    } catch (error) {
        console.error('Error:', error.response.data);
    }
};

fetchListingData();


function getQuery() {
    return `query getListingData($path: String!) {
        searchResults(path: $path) {
          listings {
            regular {
              numberOfVideos
              numberOfImages
              numberOfFloorPlans
              numberOfViews
              listingId
              title
              publishedOnLabel
              publishedOn
              availableFrom
              priceDrop {
                lastPriceChangeDate
                percentageChangeLabel
              }
              isPremium
              highlights {
                description
                label
                url
              }
              otherPropertyImages {
                small
                large
                caption
              }
              features {
                content
                iconId
              }
              image {
                src
                caption
                responsiveImgList {
                  width
                  src
                }
              }
              transports {
                title
                poiType
                distanceInMiles
                features {
                  zone
                  tubeLines
                }
              }
              flag
              listingId
              priceTitle
              price
              address
              tags {
                content
              }
              listingUris {
                contact
                detail
              }
            }
          }
        }
      }`;
}