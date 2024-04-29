import { DonationVotingMerkleDistributionStrategy } from '@allo-team/allo-v2-sdk';
import { ApolloClient, InMemoryCache, gql } from '@apollo/client/index.js';
import { Button, Frog, TextInput } from 'frog';
import { devtools } from 'frog/dev';
import { serveStatic } from 'frog/serve-static';
import { handle } from 'frog/vercel';

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
    width: '100%'
};

const apolloClient = new ApolloClient({
    uri: 'https://grants-stack-indexer-v2.gitcoin.co/graphql',
    cache: new InMemoryCache()
});

const queryGitcoinProject = async (
    networkId: string,
    roundId: string,
    projectId: string
): Promise<{ bannerImage: string; round: { id: bigint; strategyAddress: `0x${string}` } | null }> => {
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
					round {
						id
						strategyAddress
					}
				}
            }
          `
        });
        return {
            bannerImage: data?.application?.metadata?.application?.project?.bannerImg,
            round: data?.application?.round
        };
    } catch (e) {
        return { bannerImage: '', round: null };
    }
};

const getDetailsFromInitialPath = (initialPath: string) => {
    const vars = initialPath.split('/');
    const networkId = vars[2];
    const roundId = vars[3];
    const projectId = vars[4];
    return { networkId, roundId, projectId };
};

export const app = new Frog<{
    Variables: { bannerImage?: string };
    State: { qfSlide: number; donateAsset: string; donateAmount: number };
}>({
    assetsPath: '/',
    basePath: '/',
    initialState: { qfSlide: 0, donateAsset: '', donateAmount: 0 }
});

// This is a deprecated path, only for backward compatibility
app.frame(
    '/',
    async (c, next) => {
        const fullURL = new URL(c.req.url);
        const urlSearch = fullURL.searchParams.get('url');
        if (urlSearch) {
            const vars = urlSearch.split('/');
            const networkId = vars[0];
            const roundId = vars[1];
            const projectId = vars[2];
            if (networkId && roundId && projectId) {
                const { bannerImage } = await queryGitcoinProject(networkId, roundId, projectId);
                c.set('bannerImage', bannerImage);
            }
        }
        await next();
    },
    c => {
        const fullURL = new URL(c.req.url);
        const urlSearch = fullURL.searchParams.get('url');

        return c.res({
            image: (
                <div style={imageStyle}>
                    {c.var.bannerImage && <img src={`https://ipfs.io/ipfs/${c.var.bannerImage}`} style={{ width: '100%' }} />}
                </div>
            ),
            intents: [
                <Button.Redirect location={`https://explorer.gitcoin.co/#/${urlSearch}`}>Donate</Button.Redirect>,
                <Button action={`/what-is-qf/0/0/0`} value={JSON.stringify(c.var)}>
                    What is QF?
                </Button>
            ]
        });
    }
);

app.frame(
    '/frame/:networkId/:roundId/:projectId',
    async (c, next) => {
        const networkId = c.req.param('networkId');
        const roundId = c.req.param('roundId');
        const projectId = c.req.param('projectId');

        if (networkId && roundId && projectId) {
            const { bannerImage } = await queryGitcoinProject(networkId, roundId, projectId);
            c.set('bannerImage', bannerImage);
        }
        await next();
    },
    c => {
        console.debug('[ROUTE] /frame');

        return c.res({
            image: (
                <div style={imageStyle}>
                    {c.var.bannerImage && <img src={`https://ipfs.io/ipfs/${c.var.bannerImage}`} style={{ width: '100%' }} />}
                </div>
            ),
            intents: [<Button action="/select-asset">Donate</Button>, <Button action="/what-is-qf">What is QF?</Button>]
        });
    }
);

app.frame('/select-asset', c => {
    console.debug('[ROUTE] /select-asset');

    return c.res({
        image: (
            <div style={imageStyle}>
                <h3 style={{ color: 'white' }}>Assets are....</h3>
            </div>
        ),
        intents: [<TextInput placeholder="Enter asset" />, <Button action="/set-amount">Set amount</Button>, <Button.Reset>Back</Button.Reset>]
    });
});

app.frame('/set-amount', c => {
    console.debug('[ROUTE] /set-amount');

    const { inputText, deriveState } = c;
    const state = deriveState(previousState => {
        // TODO: if input empty, show error
        previousState.donateAsset = inputText!;
    });

    return c.res({
        image: (
            <div style={imageStyle}>
                <h3 style={{ color: 'white' }}>Selected {state.donateAsset}</h3>
                <h3 style={{ color: 'white' }}>Write an amount....</h3>
            </div>
        ),
        intents: [<TextInput placeholder="Enter amount" />, <Button action="/confirm-donate">Confirm</Button>, <Button.Reset>Back</Button.Reset>]
    });
});

app.frame('/confirm-donate', async c => {
    console.debug('[ROUTE] /confirm-donate');

    const { inputText, deriveState } = c;
    const state = deriveState(previousState => {
        // TODO: if input empty, show error
        previousState.donateAmount = parseInt(inputText!);
    });

    return c.res({
        image: (
            <div style={imageStyle}>
                <h3 style={{ color: 'white' }}>Do you confirm?</h3>
                <h3 style={{ color: 'white' }}>
                    {state.donateAmount} {state.donateAsset}
                </h3>
            </div>
        ),
        intents: [<Button.Transaction target="/donate">Submit</Button.Transaction>, <Button.Reset>Back</Button.Reset>]
    });
});

app.transaction('/donate', async c => {
    console.debug('[ROUTE] /donate');

    const { initialPath } = c;
    const { networkId, roundId, projectId } = getDetailsFromInitialPath(initialPath);
    const { round } = await queryGitcoinProject(networkId, roundId, projectId);
    const pool = new DonationVotingMerkleDistributionStrategy({ chain: 8453, address: round!.strategyAddress, poolId: round!.id });
    // TODO: prepare permit2 data
    const { data, to, value } = pool.getAllocateData('' as any);
    return c.send({ value: BigInt(value), to, data, chainId: 'eip155:8453' });
});

app.frame('/what-is-qf', c => {
    console.debug('[ROUTE] /what-is-qf');

    const { buttonValue, deriveState } = c;
    const state = deriveState(previousState => {
        if (buttonValue === 'next') previousState.qfSlide++;
        if (buttonValue === 'prev') previousState.qfSlide--;
    });

    const nextButton = state.qfSlide < 2 ? [<Button value="next">NEXT</Button>] : [];
    const prevButton = state.qfSlide > 0 ? [<Button value="prev">PREVIOUS</Button>] : [];

    function image(slide: number) {
        switch (slide) {
            case 0:
                return (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            padding: '0px 5%',
                            backgroundColor: 'white',
                            fontSize: 30,
                            height: '100%'
                        }}
                    >
                        <h1>Unlock the power of community funding</h1>
                    </div>
                );
            case 1:
                return (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            padding: '0px 5%',
                            backgroundColor: 'white',
                            fontSize: 30,
                            height: '100%'
                        }}
                    >
                        <h1>What is QF?</h1>
                        <p>
                            Quadratic Funding (QF) is a crowdfunding approach that leverages community donations to allocate funds. Donations act
                            as votes, with broader support resulting in larger matches.
                        </p>
                    </div>
                );
            default:
                return (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            padding: '0px 5%',
                            backgroundColor: 'white',
                            fontSize: 30,
                            height: '100%'
                        }}
                    >
                        <h1 style={{ margin: 0 }}>Why QF?</h1>
                        <h3 style={{ margin: 0, marginTop: 15 }}>MANY DONATIONS WIN</h3>
                        <p style={{ margin: 0 }}>lorem ipsum</p>
                        <h3 style={{ margin: 0, marginTop: 15 }}>MULTIPLIED BY REAL PEOPLE</h3>
                        <p style={{ margin: 0 }}>lorem ipsum</p>
                        <h3 style={{ margin: 0, marginTop: 15 }}>FOR REAL PEOPLE</h3>
                        <p style={{ margin: 0 }}>lorem ipsum</p>
                    </div>
                );
        }
    }

    return c.res({
        image: image(state.qfSlide),
        intents: [<Button.Reset>Back</Button.Reset>, ...prevButton, ...nextButton]
    });
});

// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== 'undefined';
const isProduction = isEdgeFunction || import.meta.env?.MODE !== 'development';
devtools(app, isProduction ? { assetsPath: '/.frog' } : { serveStatic });

export const GET = handle(app);
export const POST = handle(app);
