import express from "express";
import bodyParser from "body-parser";
import Blockchain, { Block, Transaction } from "./blockchain";
import request from "request-promise";

const app = express();
const jsonParser = bodyParser.json();
app.use(jsonParser);

const nodeAddress = process.argv[2];
const port = process.argv[3];
const nodeUrl = `http://localhost:${port}`;
const bitcoin = new Blockchain(nodeUrl);

enum Endpoint {
    BLOCKCHAIN = "/blockchain",
    TRANSACTION = "/transaction",
    TRANSACTION_BROADCAST = "/transaction/broadcast",
    MINE = "/mine",
    REGISTER_NODE = "/register-node",
    REGISTER_NODE_BULK = "/register-node-bulk",
    REGISTER_AND_BROADCAST_NODE = "/register-and-broadcast-node",
    RECEIVE_NEW_BLOCK = "/receive-new-block",
    CONSENSUS = "/consensus",
}

enum Method {
    GET = "GET",
    POST = "POST",
}

const broadcastToNode = (
    nodeUrl: string,
    endpoint: Endpoint,
    method: Method,
    body?: unknown
) =>
    request({
        uri: nodeUrl + endpoint,
        method,
        body,
        json: true,
    });

const broadcastToNetwork = async (
    endpoint: Endpoint,
    method: Method,
    body?: unknown
) => {
    const results = await Promise.all(
        bitcoin.network.map((nodeUrl) =>
            broadcastToNode(nodeUrl, endpoint, method, body)
        )
    );
    return results;
};

app.get(Endpoint.BLOCKCHAIN, (req, res) => {
    res.send(bitcoin);
});

app.get(Endpoint.MINE, async (get, res) => {
    const lastBlock = bitcoin.getLastBlock();
    const previousBlockHash = lastBlock.hash;
    const index = lastBlock.index + 1;
    const transactions = bitcoin.pendingTransactions;

    console.log(`Mining block number ${index}`);
    const nonce = bitcoin.proofOfWork(index, previousBlockHash, transactions);
    const blockHash = bitcoin.hashBlock(
        index,
        previousBlockHash,
        transactions,
        nonce
    );
    const newBlock = bitcoin.createNewBlock(
        nonce,
        blockHash,
        previousBlockHash
    );
    console.log(`Mining done ${blockHash}`);

    await broadcastToNetwork(Endpoint.RECEIVE_NEW_BLOCK, Method.POST, newBlock);
    const reward = bitcoin.createNewTransaction("NETWORK", nodeAddress, 12.5);
    await broadcastToNetwork(Endpoint.TRANSACTION, Method.POST, reward);
    bitcoin.addBlock(newBlock);
    bitcoin.addTransactionToPendingTransactions(reward);
    res.send({
        status: "New block mined successfully.",
        block: newBlock,
    });
});

app.post(Endpoint.RECEIVE_NEW_BLOCK, (req, res) => {
    const newBlock: Block = req.body;

    if (bitcoin.blockCanBeAdd(bitcoin.getLastBlock(), newBlock)) {
        bitcoin.addBlock(newBlock);
    }
    res.json({ status: "New block received successfully." });
});

// Register a node and broadcast it on the network
app.post(Endpoint.REGISTER_AND_BROADCAST_NODE, async (req, res) => {
    const newNodeUrl = req.body.newNodeUrl;

    // Tell other nodes to add the new node
    await broadcastToNetwork(Endpoint.REGISTER_NODE, Method.POST, {
        newNodeUrl,
    });
    bitcoin.addNodeToTheNetwork(newNodeUrl);
    // Add new node
    await broadcastToNode(
        newNodeUrl,
        Endpoint.REGISTER_NODE_BULK,
        Method.POST,
        {
            newNodeUrls: [...bitcoin.network, bitcoin.url],
        }
    );
    res.json({ status: "New node registered successfully." });
});

// Register a node
app.post(Endpoint.REGISTER_NODE, (req, res) => {
    const newNodeUrl = req.body.newNodeUrl;

    bitcoin.addNodeToTheNetwork(newNodeUrl);
    res.json({ status: "New node registered successfully." });
});

// Register multiple nodes
app.post(Endpoint.REGISTER_NODE_BULK, (req, res) => {
    const newNodeUrls = req.body.newNodeUrls;

    newNodeUrls.forEach((nodeUrl: string) => {
        bitcoin.addNodeToTheNetwork(nodeUrl);
    });
    res.json({ status: "New nodes registered successfully." });
});

app.post(Endpoint.TRANSACTION, (req, res) => {
    bitcoin.addTransactionToPendingTransactions(req.body);
    res.json({ status: "Transaction created successfully." });
});

app.post(Endpoint.TRANSACTION_BROADCAST, async (req, res) => {
    const { sender, recipient, amount } = req.body;
    const newTransaction: Transaction = bitcoin.createNewTransaction(
        sender,
        recipient,
        amount
    );

    // Tell other nodes to add the new transaction
    await broadcastToNetwork(Endpoint.TRANSACTION, Method.POST, {
        newTransaction,
    });
    bitcoin.addTransactionToPendingTransactions(newTransaction);
    res.json({ status: "Transaction created and broadcast successfully." });
});

app.get(Endpoint.CONSENSUS, async (req, res) => {
    const blockchains: Blockchain[] = await broadcastToNetwork(
        Endpoint.BLOCKCHAIN,
        Method.GET
    );
    let maxChainLength = bitcoin.chain.length;
    let newLongestChain: Blockchain["chain"] | null = null;
    let newPendingTransaction: Blockchain["pendingTransactions"] | null = null;
    blockchains.forEach((blockchain) => {
        if (blockchain.chain.length > maxChainLength) {
            maxChainLength = blockchain.chain.length;
            newLongestChain = blockchain.chain;
            newPendingTransaction = blockchain.pendingTransactions;
        }
    });
    if (
        newLongestChain &&
        bitcoin.chainIsValid(newLongestChain) &&
        newPendingTransaction
    ) {
        bitcoin.chain = newLongestChain;
        bitcoin.pendingTransactions = newPendingTransaction;
        res.json({ status: "Blockchain has been updated." });
    } else {
        res.json({ status: "Blockchain is already up to date." });
    }
});

app.listen(port, () => {
    console.log(`Node ${nodeAddress} now listening on port ${port}`);
});
