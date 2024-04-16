import { ApolloClient, InMemoryCache, gql } from '@apollo/client/index.js';
import { Button, Frog } from 'frog'
import { devtools } from 'frog/dev'
import { serveStatic } from 'frog/serve-static'
import { handle } from 'frog/vercel'

const imageStyle = {
	alignItems: 'center',
	background: 'black',
	backgroundSize: '100% 100%',
	display: 'flex',
	flexDirection: 'column',
	flexWrap: 'nowrap',
	height: '100%',
	justifyContent: 'center',
	textAlign: 'center',
	width: '100%',
}

const apolloClient = new ApolloClient({
	uri: "https://grants-stack-indexer-v2.gitcoin.co/graphql",
	cache: new InMemoryCache(),
});

const queryGitcoinProject = async (networkId: string, roundId: string, projectId: string) => {
	try {
		const { data } = await apolloClient.query({
			query: gql`
				query {
					application(
						chainId: ${parseInt(networkId)}
						id: "${projectId}"
						roundId: "${roundId}"
					) {
						id
						metadata
					}
				}
			`,
		});
		return data?.application?.metadata?.application?.project?.bannerImg
	} catch (e) {
		return ''
	}
}

export const app = new Frog<{
	Variables: { projectPath?: string, bannerImage?: string },
	State: { qfSlide: number, projectPath: string, bannerImage: string }
}>({
	assetsPath: '/',
	basePath: '/',
	initialState: {
		qfSlide: 0,
		projectPath: '',
		bannerImage: ''
	}
})

app.frame('/', async (c, next) => {
	const fullURL = new URL(c.req.url);
	const urlSearch = fullURL.searchParams.get('url');
	if (urlSearch) {
		const vars = urlSearch.split('/');
		const networkId = vars[0];
		const roundId = vars[1];
		const projectId = vars[2];
		if (networkId && roundId && projectId) {
			const bannerImage = await queryGitcoinProject(networkId, roundId, projectId);
			c.set('projectPath', urlSearch)
			c.set('bannerImage', bannerImage)
		}
	}
	await next()
}, (c) => {
	return c.res({
		image: (
			<div style={imageStyle}>
				{c.var.bannerImage && (
					<img src={`https://ipfs.io/ipfs/${c.var.bannerImage}`} style={{ width: '100%' }} />
				)}
			</div>
		),
		intents: [
			<Button.Redirect location={`https://explorer.gitcoin.co/#/${c.var.projectPath}`}>Donate</Button.Redirect>,
			<Button action={`/what-is-qf/0/0/0`} value={JSON.stringify(c.var)}>What is QF?</Button>,
		],
	})
})

app.frame('/frame/:networkId/:roundId/:projectId', async (c, next) => {
	const networkId = c.req.param('networkId');
	const roundId = c.req.param('roundId');
	const projectId = c.req.param('projectId');

	if (networkId && roundId && projectId) {
		const bannerImg = await queryGitcoinProject(networkId, roundId, projectId);
		c.set('projectPath', `${networkId}/${roundId}/${projectId}`)
		c.set('bannerImage', bannerImg)
	}
	await next()
}, (c) => {
	console.log('CUSTOM ROUTE')

	const networkId = c.req.param('networkId');
	const roundId = c.req.param('roundId');
	const projectId = c.req.param('projectId');

	return c.res({
		image: (
			<div style={imageStyle}>
				{c.var.bannerImage && (
					<img src={`https://ipfs.io/ipfs/${c.var.bannerImage}`} style={{ width: '100%' }} />
				)}
			</div>
		),
		intents: [
			<Button.Redirect location={`https://explorer.gitcoin.co/#/${c.var.projectPath}`}>Donate</Button.Redirect>,
			<Button action={`/what-is-qf/${networkId}/${roundId}/${projectId}`}>What is QF?</Button>,
		],
	})
})

// NOTE: THIS IS CLOSE TO FINAL VERSION
app.frame('/what-is-qf/:networkId/:roundId/:projectId', (c) => {
	const networkId = c.req.param('networkId');
	const roundId = c.req.param('roundId');
	const projectId = c.req.param('projectId');
	console.log('WHAT IS QF', networkId, roundId, projectId)
	const { buttonValue, deriveState } = c
	const state = deriveState(previousState => {
		if (buttonValue === 'next') previousState.qfSlide++
		if (buttonValue === 'prev') previousState.qfSlide--
	})

	const nextButton = state.qfSlide < 2 ? [<Button value="next">NEXT</Button>] : []
	const prevButton = state.qfSlide > 0 ? [<Button value="prev">PREVIOUS</Button>] : []

	function image(slide: number) {
		switch (slide) {
			case 0:
				return (
					<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0px 5%', backgroundColor: 'white', fontSize: 30, height: '100%' }}>
						<h1>Unlock the power of community funding</h1>
					</div>
				)
			case 1:
				return (
					<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0px 5%', backgroundColor: 'white', fontSize: 30, height: '100%' }}>
						<h1>What is QF?</h1>
						<p>Quadratic Funding (QF) is a crowdfunding approach that leverages community donations to allocate funds. Donations act as votes, with broader support resulting in larger matches.</p>
					</div>
				)
			default:
				return (
					<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0px 5%', backgroundColor: 'white', fontSize: 30, height: '100%' }}>
						<h1 style={{ margin:0 }}>Why QF?</h1>
						<h3 style={{ margin:0, marginTop: 15 }}>MANY DONATIONS WIN</h3>
						<p style={{ margin:0 }}>lorem ipsum</p>
						<h3 style={{ margin:0, marginTop: 15 }}>MULTIPLIED BY REAL PEOPLE</h3>
						<p style={{ margin:0 }}>lorem ipsum</p>
						<h3 style={{ margin:0, marginTop: 15 }}>FOR REAL PEOPLE</h3>
						<p style={{ margin:0 }}>lorem ipsum</p>
					</div>
				)
		}
	}


	return c.res({
		image: image(state.qfSlide),
		intents: [<Button.Reset>Back</Button.Reset>, ...prevButton, ...nextButton]
	})
})

// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== 'undefined'
const isProduction = isEdgeFunction || import.meta.env?.MODE !== 'development'
devtools(app, isProduction ? { assetsPath: '/.frog' } : { serveStatic })

export const GET = handle(app)
export const POST = handle(app)
