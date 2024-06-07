import React from 'react';
import { ethers } from 'ethers';

export default function Page({ params }: { params: { message: string } }) {
    return <div>My Post: {params.message}</div>;
}
