import { equals } from "ramda";
import sha256 from "sha256";
import { v4 as uuid } from "uuid";

export class Block {
    public timestamp: number;

    constructor(
        public index: number,
        public transactions: Transaction[],
        public nonce: number,
        public hash: string,
        public previousBlockHash: string,
        timestamp?: number
    ) {
        this.timestamp = timestamp ?? Date.now();
    }
}

export class Transaction {
    public id: string;

    constructor(
        public sender: string,
        public recipient: string,
        public amount: number
    ) {
        this.id = uuid().replace(/-/g, "");
    }
}

class Blockchain {
    public genesis: Block;

    constructor(
        public url: string,
        public chain: Block[] = [],
        public pendingTransactions: Transaction[] = [],
        public network: string[] = []
    ) {
        this.genesis = this.createNewBlock(0, "0", "0", 0);
        this.addBlock(this.genesis);
    }

    createNewBlock = (
        nonce: Block["nonce"],
        hash: Block["hash"],
        previousBlockHash: Block["previousBlockHash"],
        timestamp?: number
    ) => {
        return new Block(
            this.chain.length,
            this.pendingTransactions,
            nonce,
            hash,
            previousBlockHash,
            timestamp
        );
    };

    addBlock = (block: Block) => {
        this.chain.push(block);
        this.pendingTransactions = [];
    };

    getLastBlock = () => this.chain[this.chain.length - 1];

    hashBlock = (
        index: Block["index"],
        previousBlockHash: Block["previousBlockHash"],
        transactions: Block["transactions"],
        nonce: Block["nonce"]
    ) =>
        sha256(
            JSON.stringify({
                index,
                previousBlockHash,
                transactions,
                nonce,
            })
        );

    hashIsValid = (hash: string) => hash.startsWith("0000");

    proofOfWork = (
        index: Block["index"],
        previousBlockHash: Block["previousBlockHash"],
        transactions: Block["transactions"]
    ) => {
        let nonce = 0;
        let hash = this.hashBlock(
            index,
            previousBlockHash,
            transactions,
            nonce
        );

        while (!this.hashIsValid(hash)) {
            hash = this.hashBlock(
                index,
                previousBlockHash,
                transactions,
                ++nonce
            );
        }
        return nonce;
    };

    blockCanBeAdd = (previousBlock: Block, block: Block) => {
        const blockHash = this.hashBlock(
            block.index,
            block.previousBlockHash,
            block.transactions,
            block.nonce
        );

        return (
            block.previousBlockHash === previousBlock.hash &&
            block.index === previousBlock.index + 1 &&
            this.hashIsValid(blockHash)
        );
    };

    nodeUrlIsInTheNetwork = (nodeUrl: string) => {
        return this.network.includes(nodeUrl);
    };

    addNodeToTheNetwork = (nodeUrl: string) => {
        if (!this.nodeUrlIsInTheNetwork(nodeUrl) && nodeUrl !== this.url) {
            this.network.push(nodeUrl);
        }
    };

    createNewTransaction = (
        sender: Transaction["sender"],
        recipient: Transaction["recipient"],
        amount: Transaction["amount"]
    ) => new Transaction(sender, recipient, amount);

    addTransactionToPendingTransactions = (transaction: Transaction) => {
        this.pendingTransactions.push(transaction);
        return this.getLastBlock().index + 1;
    };

    chainIsValid = (chain: Block[]) => {
        if (!equals(chain[0], this.genesis)) {
            return false;
        }
        for (let i = 1; i < chain.length; ++i) {
            if (!this.blockCanBeAdd(chain[i - 1], chain[i])) {
                return false;
            }
        }
        return true;
    };
}

export default Blockchain;
