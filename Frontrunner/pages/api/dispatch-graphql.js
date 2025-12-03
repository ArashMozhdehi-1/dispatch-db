/**
 * Proxy API to forward GraphQL requests to the Dispatch backend GraphQL endpoint
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dispatchGraphQLUrl = `http://${process.env.DISPATCH_DB_HOST || 'localhost'}:3000/api/graphql`;
    
    console.log(`🔄 Proxying GraphQL request to Dispatch: ${dispatchGraphQLUrl}`);
    
    const response = await fetch(dispatchGraphQLUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ Dispatch GraphQL error:', data);
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error proxying to Dispatch GraphQL:', error);
    res.status(500).json({ 
      error: 'Failed to proxy GraphQL request',
      message: error.message
    });
  }
}


