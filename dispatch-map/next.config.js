module.exports = {
    async rewrites() {
        return [
            {
                source: '/api/graphql',
                destination: 'http://graphql:3000/api/graphql'
            }
        ];
    }
};
