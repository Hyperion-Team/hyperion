import { DonationVotingMerkleDistributionStrategy } from '@allo-team/allo-v2-sdk';
import { ApolloClient, InMemoryCache, gql } from '@apollo/client/index.js';
import { JsonRpcProvider } from 'ethers';
import { ethers } from 'ethers';
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

interface Chain {
    id: number;
    name: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    rpcUrls: string[];
    blockExplorerUrls: string[];
}

const CHAIN = {
    ARBITRUM_ONE: {
        id: 42_161,
        name: 'Arbitrum One',
        nativeCurrency: {
            name: 'ETH',
            symbol: 'ETH',
            decimals: 18
        },
        rpcUrls: ['https://arbitrum.llamarpc.com'],
        blockExplorerUrls: ['https://arbiscan.io']
    },
    BASE: {
        id: 8453,
        name: 'Base',
        nativeCurrency: {
            name: 'ETH',
            symbol: 'ETH',
            decimals: 18
        },
        rpcUrls: ['https://mainnet.base.org'],
        blockExplorerUrls: ['https://basescan.org']
    }
} satisfies Record<string, Chain>;

const DONATION_CONTRACT_ABI = [
    {
        inputs: [
            { internalType: 'address', name: '_eas', type: 'address' },
            { internalType: 'bytes32', name: '_easSchema', type: 'bytes32' },
            { internalType: 'address', name: '_acrossSpokePool', type: 'address' },
            { internalType: 'address', name: '_allo', type: 'address' },
            { internalType: 'address', name: '_wethAddress', type: 'address' }
        ],
        stateMutability: 'nonpayable',
        type: 'constructor'
    },
    { inputs: [], name: 'InsufficientFunds', type: 'error' },
    { inputs: [], name: 'InvalidEAS', type: 'error' },
    { inputs: [], name: 'NoRoundOnDestination', type: 'error' },
    { inputs: [], name: 'Unauthorized', type: 'error' },
    {
        anonymous: false,
        inputs: [{ indexed: false, internalType: 'bytes', name: '', type: 'bytes' }],
        name: 'Logger',
        type: 'event'
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: 'address',
                name: 'previousOwner',
                type: 'address'
            },
            {
                indexed: true,
                internalType: 'address',
                name: 'newOwner',
                type: 'address'
            }
        ],
        name: 'OwnershipTransferred',
        type: 'event'
    },
    {
        inputs: [],
        name: 'ALLO_ADDRESS',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [],
        name: 'EAS_SCHEMA',
        outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [],
        name: 'NATIVE',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [],
        name: 'SPOKE_POOL',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [],
        name: 'WETH_ADDRESS',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [
            {
                components: [
                    { internalType: 'address', name: 'recipient', type: 'address' },
                    { internalType: 'address', name: 'inputToken', type: 'address' },
                    { internalType: 'address', name: 'outputToken', type: 'address' },
                    { internalType: 'uint256', name: 'inputAmount', type: 'uint256' },
                    { internalType: 'uint256', name: 'outputAmount', type: 'uint256' },
                    {
                        internalType: 'uint256',
                        name: 'destinationChainId',
                        type: 'uint256'
                    },
                    {
                        internalType: 'address',
                        name: 'exclusiveRelayer',
                        type: 'address'
                    },
                    { internalType: 'uint32', name: 'quoteTimestamp', type: 'uint32' },
                    { internalType: 'uint32', name: 'fillDeadline', type: 'uint32' },
                    {
                        internalType: 'uint32',
                        name: 'exclusivityDeadline',
                        type: 'uint32'
                    }
                ],
                internalType: 'struct DonationWrapper.DepositParams',
                name: 'params',
                type: 'tuple'
            },
            { internalType: 'bytes', name: 'message', type: 'bytes' }
        ],
        name: 'callDepositV3',
        outputs: [],
        stateMutability: 'payable',
        type: 'function'
    },
    {
        inputs: [{ internalType: 'bytes32', name: '_messageHash', type: 'bytes32' }],
        name: 'getEthSignedMessageHash',
        outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        stateMutability: 'pure',
        type: 'function'
    },
    {
        inputs: [{ internalType: 'bytes', name: '_message', type: 'bytes' }],
        name: 'getMessageHash',
        outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        stateMutability: 'pure',
        type: 'function'
    },
    {
        inputs: [
            { internalType: 'address', name: 'tokenSent', type: 'address' },
            { internalType: 'uint256', name: 'amount', type: 'uint256' },
            { internalType: 'address', name: 'relayer', type: 'address' },
            { internalType: 'bytes', name: 'message', type: 'bytes' }
        ],
        name: 'handleV3AcrossMessage',
        outputs: [],
        stateMutability: 'payable',
        type: 'function'
    },
    {
        inputs: [],
        name: 'owner',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [],
        name: 'permit2',
        outputs: [
            {
                internalType: 'contract ISignatureTransfer',
                name: '',
                type: 'address'
            }
        ],
        stateMutability: 'view',
        type: 'function'
    },
    {
        inputs: [
            {
                internalType: 'bytes32',
                name: '_ethSignedMessageHash',
                type: 'bytes32'
            },
            { internalType: 'bytes', name: '_signature', type: 'bytes' }
        ],
        name: 'recoverSigner',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'pure',
        type: 'function'
    },
    {
        inputs: [],
        name: 'renounceOwnership',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        inputs: [{ internalType: 'bytes', name: 'sig', type: 'bytes' }],
        name: 'splitSignature',
        outputs: [
            { internalType: 'bytes32', name: 'r', type: 'bytes32' },
            { internalType: 'bytes32', name: 's', type: 'bytes32' },
            { internalType: 'uint8', name: 'v', type: 'uint8' }
        ],
        stateMutability: 'pure',
        type: 'function'
    },
    {
        inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
        name: 'transferOwnership',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        inputs: [{ internalType: 'uint256', name: '_amount', type: 'uint256' }],
        name: 'unwrapWETH',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    },
    {
        inputs: [
            { internalType: 'address', name: '_signer', type: 'address' },
            { internalType: 'bytes', name: '_message', type: 'bytes' },
            { internalType: 'bytes', name: '_signature', type: 'bytes' }
        ],
        name: 'verify',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'pure',
        type: 'function'
    },
    {
        inputs: [
            { internalType: 'bytes', name: 'donationData', type: 'bytes' },
            { internalType: 'bytes', name: 'signature', type: 'bytes' }
        ],
        name: 'verifyDonation',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'pure',
        type: 'function'
    },
    {
        inputs: [],
        name: 'withdraw',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    },
    { stateMutability: 'payable', type: 'receive' }
];

const DONATION_CONTRACT_ADDRESS_PER_CHAIN_ID = {
    [CHAIN.BASE.id]: '0x51C2DDC09B67aB9152ACFB6a9a5E7A8DB1485ae8',
    [CHAIN.ARBITRUM_ONE.id]: '0xaA098E5c9B002F815d7c9756BCfce0fC18B3F362'
};

const WRAPPED_ETH_ADDRESS_PER_CHAIN_ID = {
    [CHAIN.BASE.id]: '0x4200000000000000000000000000000000000006',
    [CHAIN.ARBITRUM_ONE.id]: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'
};

const apolloClient = new ApolloClient({
    uri: 'https://grants-stack-indexer-v2.gitcoin.co/graphql',
    cache: new InMemoryCache()
});

const generateCombinedMessage = (message: string, signature: string) => {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return abiCoder.encode(['bytes', 'bytes'], [message, signature]);
};

const queryGitcoinProject = async (
    networkId: string,
    roundId: string,
    projectId: string
): Promise<{
    bannerImage: string;
    round: { id: bigint; strategyAddress: `0x${string}` } | null;
    anchorAddress: string | null;
}> => {
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
                    anchorAddress
				}
            }
          `
        });
        return {
            bannerImage: data?.application?.metadata?.application?.project?.bannerImg,
            round: data?.application?.round,
            anchorAddress: data?.application?.anchorAddress
        };
    } catch (e) {
        return { bannerImage: '', round: null, anchorAddress: null };
    }
};

const getDetailsFromInitialPath = (initialPath: string) => {
    const vars = initialPath.split('/');
    const networkId = vars[2];
    const roundId = vars[3];
    const projectId = vars[4];
    return { networkId, roundId, projectId };
};

const generateVote = (recipientId: string, amount: BigInt) => {
    const PermitTypeNone = 0; // 0 = native currency transfer
    const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; // Gitcoin internal address for native
    const nonce = 0; // approval specific, always 0 in our case
    const deadline = 0; // approval specific, always 0 in our case
    const signature = '0x0000000000000000000000000000000000000000000000000000000000000000'; // approval specific, always 0x in our case
    const types = ['address', 'uint8', 'tuple(tuple(tuple(address, uint256), uint256, uint256), bytes)'];
    const data = [
        recipientId,
        PermitTypeNone, // PermitType.None as 0
        [
            // Permit2Data
            [
                // ISignatureTransfer.PermitTransferFrom
                [
                    // ISignatureTransfer.TokenPermissions
                    NATIVE,
                    amount // Amount
                ],
                nonce, // Nonce
                deadline // Deadline
            ],
            signature // Signature as an empty byte string
        ]
    ];
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return abiCoder.encode(types, data);
};

const generateDonationData = (roundId: number, senderAddress: string, voteParameters: string) => {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    return abiCoder.encode(['uint256', 'address', 'bytes'], [roundId, senderAddress, voteParameters]);
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
                    {c.var.bannerImage && (
                        <img src={`https://ipfs.io/ipfs/${c.var.bannerImage}`} style={{ width: '100%' }} />
                    )}
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
                    {c.var.bannerImage && (
                        <img src={`https://ipfs.io/ipfs/${c.var.bannerImage}`} style={{ width: '100%' }} />
                    )}
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
        intents: [
            <TextInput placeholder="Enter asset" />,
            <Button action="/set-amount">Set amount</Button>,
            <Button.Reset>Back</Button.Reset>
        ]
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
        intents: [
            <TextInput placeholder="Enter amount" />,
            <Button action="/confirm-donate">Confirm</Button>,
            <Button.Reset>Back</Button.Reset>
        ]
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

    const { initialPath, address } = c;
    const { networkId, roundId, projectId } = getDetailsFromInitialPath(initialPath);
    const { round, anchorAddress } = await queryGitcoinProject(networkId, roundId, projectId);
    // const pool = new DonationVotingMerkleDistributionStrategy({
    //     chain: 8453,
    //     address: round!.strategyAddress,
    //     poolId: round!.id
    // });

    const signer = new ethers.Wallet('some-pk', new JsonRpcProvider(CHAIN.ARBITRUM_ONE.rpcUrls[0]));

    console.log({ round });
    // TODO: this can of-course be null
    const vote = generateVote(anchorAddress!, BigInt('1000000000000000000'));
    console.log({ vote });
    const encodedMessage = generateDonationData(Number(roundId), address, vote);
    console.log({ encodedMessage });
    console.log({ networkId, x: typeof networkId });
    const contractOrigin = new ethers.Contract(
        DONATION_CONTRACT_ADDRESS_PER_CHAIN_ID[Number(networkId)],
        DONATION_CONTRACT_ABI,
        signer
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const messageHash = await contractOrigin.getMessageHash(encodedMessage);
    console.log({ messageHash });

    const signature = await signer.signMessage(ethers.getBytes(messageHash));
    console.log({ signature });

    const messageCombined = generateCombinedMessage(encodedMessage, signature);
    console.log({ messageCombined });

    const userAmountInWei = BigInt('1000000000000000000');

    const url = `https://across.to/api/suggested-fees?${new URLSearchParams({
        originChainId: '8453',
        token: WRAPPED_ETH_ADDRESS_PER_CHAIN_ID[Number('8453')],
        amount: '1000000000000000000', // userAmountInWei.toString(),
        message: messageCombined,
        recipient: DONATION_CONTRACT_ADDRESS_PER_CHAIN_ID[Number(networkId)],
        destinationChainId: networkId
    }).toString()}`;

    console.log({ url });

    let feeResponse;
    try {
        const response = await fetch(`https://www.idriss.xyz/post-data`, {
            method: 'POST',
            body: JSON.stringify({ url }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        // const response = await fetch(url, {
        //     method: 'GET'
        //     // headers: {
        //     //     'Content-Type': 'application/json'
        //     // }
        // });
        // console.log({ response: await response.text(), responseStatus: response.status });
        feeResponse = await response.json();
        console.log({ feeResponse });
    } catch (e) {
        console.error(e);
    }

    console.log({ feeResponse });

    const fee = Math.floor(Number(feeResponse.totalRelayFee.total) * 1.01);

    const inputAmount = userAmountInWei + BigInt(fee);

    const depositParameters = {
        recipient: DONATION_CONTRACT_ADDRESS_PER_CHAIN_ID[Number(networkId)] ?? '',
        inputAmount: inputAmount,
        outputAmount: userAmountInWei,
        inputToken: WRAPPED_ETH_ADDRESS_PER_CHAIN_ID[Number('8453')] ?? '',
        outputToken: '0x0000000000000000000000000000000000000000',
        destinationChainId: Number(networkId),
        exclusiveRelayer: '0x0000000000000000000000000000000000000000',
        quoteTimestamp: Number(feeResponse.timestamp),
        fillDeadline: Math.round(Date.now() / 1000) + 21_600,
        exclusivityDeadline: 0
    };

    console.log({ contractOrigin });

    const preparedTx = await contractOrigin.callDepositV3.populateTransaction(depositParameters, messageCombined);
    console.log({ preparedTx });

    return c.send({
        value: inputAmount,
        to: DONATION_CONTRACT_ADDRESS_PER_CHAIN_ID['8453'] as `0x${string}`,
        // to: preparedTx.to as `0x${string}`,
        data: preparedTx.data as `0x${string}`,
        chainId: 'eip155:8453'
    });
});

// app.transaction('/donate', async c => {
//     console.debug('[ROUTE] /donate');

//     const { initialPath } = c;
//     const { networkId, roundId, projectId } = getDetailsFromInitialPath(initialPath);
//     const { round } = await queryGitcoinProject(networkId, roundId, projectId);
//     const pool = new DonationVotingMerkleDistributionStrategy({
//         chain: 8453,
//         address: round!.strategyAddress,
//         poolId: round!.id
//     });
//     console.log({ round });
//     // TODO: prepare permit2 data
//     const { data, to, value } = pool.getAllocateData({
//         recipientId: '0xf3002e97f5ba36BD219C5CB41e6104CFf114e351',
//         permitType: 0,
//         permit2Data: {
//             permit: {
//                 permitted: {
//                     token: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
//                     amount: BigInt(10000000000000)
//                 },
//                 nonce: BigInt(0),
//                 deadline: BigInt(0)
//             },
//             signature: '0x0000000000000000000000000000000000000000000000000000000000000000'
//         }
//     });
//     return c.send({
//         value: BigInt(value),
//         to: '0x7c24f3494cc958cf268a92b45d7e54310d161794',
//         data: '0xc7b8896b000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000009184e72a0000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001400000000000000000000000003cb73bb5fe6b1c333265946b5fd219fde1bade1200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee000000000000000000000000000000000000000000000000000009184e72a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000',
//         chainId: 'eip155:8453'
//     });
// });

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
                            Quadratic Funding (QF) is a crowdfunding approach that leverages community donations to
                            allocate funds. Donations act as votes, with broader support resulting in larger matches.
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
